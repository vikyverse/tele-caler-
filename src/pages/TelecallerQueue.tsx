import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp, limit, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { generateCallSummary, analyzeAudioFeedback } from '../lib/gemini';
import { Phone, Check, X, Clock, Sparkles, Mic, Square, Loader2, Send } from 'lucide-react';
import { cn } from '../lib/utils';

interface Lead {
  id: string;
  name: string;
  phone: string;
  status: string;
  notes: string;
  temperature?: string;
}

export default function TelecallerQueue() {
  const { user } = useAuth();
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Feedback form state
  const [status, setStatus] = useState('interested');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [manualNumber, setManualNumber] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  
  // AI Results State
  const [aiAnalysis, setAiAnalysis] = useState<{
    transcript: string;
    summary: string;
    sentiment: string;
    temperature: string;
    suggestedMessage: string;
  } | null>(null);

  useEffect(() => {
    if (user) {
      fetchNextLead();
    }
  }, [user]);

  const fetchNextLead = async () => {
    setLoading(true);
    setAiAnalysis(null);
    setNotes('');
    setStatus('interested');
    try {
      const assignedQuery = query(
        collection(db, 'leads'),
        where('assignedTo', '==', user?.uid)
      );
      
      let snap = await getDocs(assignedQuery);
      
      // Filter in memory to avoid composite index requirement
      let validDocs = snap.docs.filter(doc => ['new', 'call_back'].includes(doc.data().status));
      
      if (validDocs.length === 0) {
        // Try to find an unassigned 'new' lead
        const unassignedQuery = query(
          collection(db, 'leads'),
          where('assignedTo', '==', '')
        );
        snap = await getDocs(unassignedQuery);
        
        validDocs = snap.docs.filter(doc => doc.data().status === 'new');
        
        if (validDocs.length > 0) {
          // Claim it
          const leadDoc = validDocs[0];
          await updateDoc(doc(db, 'leads', leadDoc.id), {
            assignedTo: user?.uid
          });
          setCurrentLead({ id: leadDoc.id, ...leadDoc.data() } as Lead);
        } else {
          setCurrentLead(null);
        }
      } else {
        const leadDoc = validDocs[0];
        setCurrentLead({ id: leadDoc.id, ...leadDoc.data() } as Lead);
      }

      // Get total queue count for this user
      setQueueCount(validDocs.length);

    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'leads');
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType });
        await processAudio(audioBlob, mediaRecorder.mimeType);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Microphone access is required to record voice notes.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const processAudio = async (blob: Blob, mimeType: string) => {
    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result as string;
        // Remove the data URL prefix (e.g., "data:audio/webm;base64,")
        const base64String = base64data.split(',')[1];
        
        const analysis = await analyzeAudioFeedback(base64String, mimeType);
        setAiAnalysis(analysis);
        setNotes(analysis.transcript); // Auto-fill notes with transcript
        
        // Auto-select status based on temperature/sentiment if possible
        if (analysis.temperature === 'hot' || analysis.sentiment === 'excited') {
          setStatus('interested');
        } else if (analysis.temperature === 'cold' && analysis.sentiment === 'negative') {
          setStatus('not_reachable');
        }
      };
    } catch (error) {
      console.error("Error processing audio:", error);
      alert("Failed to analyze audio. Please type your notes instead.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const submitFeedback = async () => {
    if (!currentLead || !user) return;
    setIsSubmitting(true);

    try {
      // 1. Generate AI Summary if notes exist and we haven't done audio analysis
      let aiSummary = aiAnalysis?.summary || '';
      let sentiment = aiAnalysis?.sentiment || 'unknown';
      let temperature = aiAnalysis?.temperature || 'unassigned';
      let suggestedMessage = aiAnalysis?.suggestedMessage || '';
      let transcript = aiAnalysis?.transcript || '';

      if (!aiAnalysis && notes.trim().length > 10) {
        const aiResult = await generateCallSummary(notes);
        aiSummary = aiResult.summary;
        sentiment = aiResult.sentiment;
        temperature = aiResult.temperature;
        suggestedMessage = aiResult.suggestedMessage;
      }

      const timestamp = new Date().toISOString();

      // 2. Add Call Log
      await addDoc(collection(db, 'callLogs'), {
        leadId: currentLead.id,
        callerId: user.uid,
        status,
        notes,
        aiSummary,
        sentiment,
        temperature,
        transcript,
        suggestedMessage,
        timestamp
      });

      // 3. Update Lead
      await updateDoc(doc(db, 'leads', currentLead.id), {
        status,
        notes,
        temperature,
        lastCalledAt: timestamp,
      });

      fetchNextLead();

    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'callLogs');
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>;
  }

  const defaultWhatsappMsg = `Hi ${currentLead?.name || ''}, thank you for your time today! Here is the brochure we discussed.`;
  const whatsappMsg = aiAnalysis?.suggestedMessage || defaultWhatsappMsg;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Active Queue</h1>
        <span className="bg-blue-100 text-blue-800 text-sm font-medium px-4 py-1.5 rounded-full shadow-sm">
          {queueCount} Leads Remaining
        </span>
      </div>

      {/* Quick Dial Section */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1 w-full">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <Phone className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="tel"
              className="block w-full pl-11 pr-4 py-3 border border-gray-200 rounded-xl bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors"
              placeholder="Quick Dial: Enter any phone number to call manually..."
              value={manualNumber}
              onChange={(e) => setManualNumber(e.target.value)}
            />
          </div>
        </div>
        <a
          href={manualNumber ? `tel:${manualNumber}` : '#'}
          className={cn(
            "w-full sm:w-auto inline-flex items-center justify-center px-8 py-3 font-bold rounded-xl transition-all",
            manualNumber 
              ? "bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30 transform hover:-translate-y-0.5" 
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          )}
          onClick={(e) => !manualNumber && e.preventDefault()}
        >
          Dial
        </a>
      </div>

      {!currentLead ? (
        <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-gray-100">
          <Check className="mx-auto h-12 w-12 text-emerald-500 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">You're all caught up!</h2>
          <p className="text-gray-500 mt-2">There are no more leads in your queue right now.</p>
          <button 
            onClick={fetchNextLead}
            className="mt-6 bg-indigo-600 text-white px-6 py-3 rounded-xl hover:bg-indigo-700 transition-colors font-medium shadow-sm"
          >
            Refresh Queue
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 text-center border-b border-gray-100">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4 shadow-lg shadow-blue-600/30">
            {currentLead.name.charAt(0).toUpperCase()}
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-3">{currentLead.name}</h2>
          
          <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-6 text-gray-600 mb-8">
            <span className="flex items-center justify-center bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200">
              <Phone className="w-4 h-4 mr-2 text-blue-600" /> {currentLead.phone}
            </span>
            {currentLead.email && (
              <span className="flex items-center justify-center bg-white px-4 py-2 rounded-full shadow-sm border border-gray-200">
                <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {currentLead.email}
              </span>
            )}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
            <a 
              href={`tel:${currentLead.phone}`}
              className="flex-1 inline-flex items-center justify-center bg-green-500 hover:bg-green-600 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-green-500/30 transform transition hover:-translate-y-0.5"
            >
              <Phone className="w-5 h-5 mr-2" />
              Dial Now
            </a>
            <a 
              href={`https://wa.me/${currentLead.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(whatsappMsg)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center bg-teal-500 hover:bg-teal-600 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-teal-500/30 transform transition hover:-translate-y-0.5"
              title="Send WhatsApp Message"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              WhatsApp
            </a>
          </div>
        </div>

        {/* Feedback Form */}
        <div className="p-8 space-y-8">
          <div className="flex justify-between items-center border-b border-gray-100 pb-4">
            <h3 className="text-xl font-bold text-gray-900">Log Call Feedback</h3>
            
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isAnalyzing}
              className={cn(
                "flex items-center px-5 py-2.5 rounded-full text-sm font-medium transition-all shadow-sm",
                isRecording 
                  ? "bg-red-100 text-red-700 animate-pulse ring-2 ring-red-500 ring-offset-2" 
                  : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
              )}
            >
              {isAnalyzing ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
              ) : isRecording ? (
                <><Square className="w-4 h-4 mr-2" fill="currentColor" /> Stop Recording</>
              ) : (
                <><Mic className="w-4 h-4 mr-2" /> Record Voice Notes</>
              )}
            </button>
          </div>

          {aiAnalysis && (
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl p-6 space-y-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-indigo-200/50 pb-3">
                <h4 className="font-bold text-indigo-900 flex items-center">
                  <Sparkles className="w-5 h-5 mr-2 text-indigo-600" />
                  AI Insights
                </h4>
                <div className="flex gap-2">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider",
                    aiAnalysis.temperature === 'hot' ? 'bg-rose-100 text-rose-700' :
                    aiAnalysis.temperature === 'warm' ? 'bg-amber-100 text-amber-700' :
                    'bg-sky-100 text-sky-700'
                  )}>
                    {aiAnalysis.temperature} Lead
                  </span>
                  <span className="bg-white/60 text-indigo-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                    {aiAnalysis.sentiment}
                  </span>
                </div>
              </div>
              
              <div>
                <p className="text-sm font-semibold text-indigo-900/70 uppercase tracking-wider mb-1">Summary</p>
                <p className="text-indigo-900 leading-relaxed">{aiAnalysis.summary}</p>
              </div>
              
              <div className="mt-4 pt-4 border-t border-indigo-200/50">
                <p className="text-sm font-semibold text-indigo-900/70 uppercase tracking-wider mb-2">Suggested WhatsApp Message</p>
                <div className="flex items-start gap-3">
                  <p className="text-sm text-indigo-900 flex-1 bg-white/60 p-3 rounded-xl border border-indigo-100/50">
                    {aiAnalysis.suggestedMessage}
                  </p>
                  <a 
                    href={`https://wa.me/${currentLead.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(aiAnalysis.suggestedMessage)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 bg-teal-500 text-white rounded-xl hover:bg-teal-600 transition-colors shadow-sm"
                    title="Send WhatsApp Message"
                  >
                    <Send className="w-5 h-5" />
                  </a>
                </div>
              </div>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">Call Outcome</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: 'interested', label: 'Interested', icon: Check, color: 'bg-blue-50 text-blue-700 border-blue-500 ring-blue-500' },
                { id: 'not_reachable', label: 'No Answer', icon: X, color: 'bg-amber-50 text-amber-700 border-amber-500 ring-amber-500' },
                { id: 'call_back', label: 'Call Back', icon: Clock, color: 'bg-purple-50 text-purple-700 border-purple-500 ring-purple-500' },
                { id: 'closed_won', label: 'Closed (Won)', icon: Sparkles, color: 'bg-emerald-50 text-emerald-700 border-emerald-500 ring-emerald-500' },
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = status === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setStatus(opt.id)}
                    className={cn(
                      "flex flex-col items-center justify-center p-4 border rounded-xl transition-all duration-200",
                      isSelected 
                        ? `ring-1 shadow-sm ${opt.color}` 
                        : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"
                    )}
                  >
                    <Icon className={cn("w-5 h-5 mb-2", isSelected ? "" : "text-gray-400")} />
                    <span className="text-sm font-medium">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notes <span className="text-gray-400 font-normal ml-1">(Type or use Voice Notes above)</span>
            </label>
            <textarea
              rows={4}
              className="w-full border border-gray-200 rounded-xl p-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-h-[120px] text-gray-700 placeholder-gray-400 transition-shadow shadow-sm"
              placeholder="What did the customer say?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button
            onClick={submitFeedback}
            disabled={isSubmitting || isRecording || isAnalyzing}
            className="w-full bg-gray-900 text-white font-bold py-4 px-4 rounded-xl hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 transition-all shadow-md active:scale-[0.98]"
          >
            {isSubmitting ? 'Saving & Loading Next...' : 'Save & Next Lead'}
          </button>
        </div>
        </div>
      )}
    </div>
  );
}
