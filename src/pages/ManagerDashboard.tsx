import React, { useState, useEffect } from 'react';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import Papa from 'papaparse';
import { Upload, Users, PhoneCall, CheckCircle, Flame, Snowflake, TrendingUp, Activity, Clock, PhoneForwarded } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState({ totalLeads: 0, totalCalls: 0, closedWon: 0, hotLeads: 0, coldLeads: 0 });
  const [realtimeStats, setRealtimeStats] = useState({ activeCalls: 0, callsLastHour: 0, avgDurationSec: 0 });
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    // Real-time listener for Leads
    const unsubscribeLeads = onSnapshot(collection(db, 'leads'), (snapshot) => {
      let closed = 0;
      let hot = 0;
      let cold = 0;
      const statusCounts: Record<string, number> = {
        'new': 0,
        'interested': 0,
        'not_reachable': 0,
        'call_back': 0,
        'closed_won': 0,
        'closed_lost': 0
      };

      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.status === 'closed_won') closed++;
        if (data.temperature === 'hot') hot++;
        if (data.temperature === 'cold') cold++;
        
        if (statusCounts[data.status] !== undefined) {
          statusCounts[data.status]++;
        }
      });

      setStats(prev => ({
        ...prev,
        totalLeads: snapshot.size,
        closedWon: closed,
        hotLeads: hot,
        coldLeads: cold
      }));

      const formattedChartData = [
        { name: 'New', value: statusCounts['new'], color: '#9ca3af' },
        { name: 'Interested', value: statusCounts['interested'], color: '#3b82f6' },
        { name: 'No Answer', value: statusCounts['not_reachable'], color: '#f59e0b' },
        { name: 'Call Back', value: statusCounts['call_back'], color: '#8b5cf6' },
        { name: 'Won', value: statusCounts['closed_won'], color: '#10b981' },
        { name: 'Lost', value: statusCounts['closed_lost'], color: '#ef4444' },
      ].filter(item => item.value > 0);

      setChartData(formattedChartData);
    }, (error) => handleFirestoreError(error, OperationType.GET, 'leads'));

    // Real-time listener for Call Logs
    const unsubscribeCalls = onSnapshot(collection(db, 'callLogs'), (snapshot) => {
      let recentCalls = 0;
      let totalDuration = 0;
      const oneHourAgo = Date.now() - (60 * 60 * 1000);

      snapshot.forEach(doc => {
        const data = doc.data();
        const callTime = new Date(data.timestamp).getTime();
        
        if (callTime >= oneHourAgo) {
          recentCalls++;
          if (data.durationSeconds) {
            totalDuration += data.durationSeconds;
          }
        }
      });

      setStats(prev => ({ ...prev, totalCalls: snapshot.size }));
      
      setRealtimeStats(prev => ({
        ...prev,
        callsLastHour: recentCalls,
        avgDurationSec: recentCalls > 0 ? Math.round(totalDuration / recentCalls) : 0
      }));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'callLogs'));

    // Real-time listener for Active Calls
    const unsubscribeActiveCalls = onSnapshot(collection(db, 'activeCalls'), (snapshot) => {
      setRealtimeStats(prev => ({ ...prev, activeCalls: snapshot.size }));
    }, (error) => handleFirestoreError(error, OperationType.GET, 'activeCalls'));

    return () => {
      unsubscribeLeads();
      unsubscribeCalls();
      unsubscribeActiveCalls();
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const leads = results.data as any[];
          let count = 0;
          for (const row of leads) {
            if (row.name && row.phone) {
              await addDoc(collection(db, 'leads'), {
                name: row.name,
                phone: row.phone,
                email: row.email || row.Emailid || row.Email || '',
                status: 'new',
                assignedTo: '',
                notes: '',
                temperature: 'unassigned',
                createdAt: new Date().toISOString(),
                createdBy: user?.uid
              });
              count++;
            }
          }
          alert(`Successfully uploaded ${count} leads!`);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'leads');
        } finally {
          setUploading(false);
          if (e.target) e.target.value = '';
        }
      }
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Dashboard Overview</h1>
          <p className="text-gray-500 mt-1">Track your team's calling performance and lead pipeline in real time.</p>
        </div>
        
        <div>
          <label className="cursor-pointer bg-gray-900 text-white px-5 py-2.5 rounded-lg hover:bg-gray-800 flex items-center shadow-md transition-all active:scale-95 font-medium">
            <Upload className="w-4 h-4 mr-2" />
            {uploading ? 'Processing CSV...' : 'Upload Leads (CSV)'}
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {/* Real-Time Telephony Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 p-6 rounded-2xl shadow-md text-white flex items-center justify-between">
          <div>
            <p className="text-indigo-100 font-medium mb-1">Active Calls</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">{realtimeStats.activeCalls}</span>
              {realtimeStats.activeCalls > 0 && (
                <span className="flex h-3 w-3 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                </span>
              )}
            </div>
          </div>
          <div className="bg-white/20 p-4 rounded-full">
            <PhoneForwarded className="w-8 h-8 text-white" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-gray-500 font-medium mb-1">Calls (Last Hour)</p>
            <span className="text-4xl font-bold text-gray-900">{realtimeStats.callsLastHour}</span>
          </div>
          <div className="bg-blue-50 p-4 rounded-full border border-blue-100">
            <Activity className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-between">
          <div>
            <p className="text-gray-500 font-medium mb-1">Avg Contact Duration</p>
            <span className="text-3xl font-bold text-gray-900 flex items-baseline">
              {formatDuration(realtimeStats.avgDurationSec)}
            </span>
          </div>
          <div className="bg-emerald-50 p-4 rounded-full border border-emerald-100">
            <Clock className="w-8 h-8 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Secondary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-50 p-2 rounded-xl">
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <p className="text-sm font-medium text-gray-500">Total Leads</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.totalLeads}</p>
        </div>
        
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-indigo-50 p-2 rounded-xl">
              <PhoneCall className="w-5 h-5 text-indigo-600" />
            </div>
            <p className="text-sm font-medium text-gray-500">Calls Made</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.totalCalls}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-emerald-50 p-2 rounded-xl">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-gray-500">Closed Won</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.closedWon}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-rose-50 p-2 rounded-xl">
              <Flame className="w-5 h-5 text-rose-600" />
            </div>
            <p className="text-sm font-medium text-gray-500">Hot Leads</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.hotLeads}</p>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex flex-col justify-center transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-sky-50 p-2 rounded-xl">
              <Snowflake className="w-5 h-5 text-sky-500" />
            </div>
            <p className="text-sm font-medium text-gray-500">Cold Leads</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{stats.coldLeads}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Lead Status Distribution</h2>
          <div className="h-72">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <PieChart className="w-12 h-12 mb-3 text-gray-200" />
                <p>No data available yet</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 flex flex-col">
          <h2 className="text-xl font-bold text-gray-900 mb-4">CSV Upload Format</h2>
          <p className="text-sm text-gray-600 mb-6 flex-1">
            To import leads successfully, your CSV file must include headers. The required columns are <strong className="text-gray-900">name</strong> and <strong className="text-gray-900">phone</strong>. You can optionally include an <strong className="text-gray-900">email</strong> column.
          </p>
          
          <div className="bg-gray-900 rounded-xl p-5 shadow-inner">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
            </div>
            <div className="font-mono text-sm text-gray-300 overflow-x-auto whitespace-nowrap">
              <span className="text-blue-400">name</span>,<span className="text-blue-400">phone</span>,<span className="text-blue-400">email</span><br/>
              John Doe,+1234567890,john@example.com<br/>
              Jane Smith,+0987654321,jane@company.com<br/>
              Bob Wilson,+1122334455,
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
