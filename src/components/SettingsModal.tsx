import React, { useState } from 'react';
import { X, Volume2, Bell, Save, Check } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { db } from '../lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { playNotificationSound } from '../lib/audio';

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { user, setUserContext } = useAuth();
  
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    user?.preferences?.notificationsEnabled ?? true
  );
  
  const [notificationSound, setNotificationSound] = useState(
    user?.preferences?.notificationSound ?? 'chime'
  );
  
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  if (!user) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedPreferences = {
        notificationsEnabled,
        notificationSound
      };

      await updateDoc(doc(db, 'users', user.uid), {
        preferences: updatedPreferences
      });

      setUserContext({
        ...user,
        preferences: updatedPreferences
      });

      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1500);

    } catch (err) {
      console.error("Failed to save preferences", err);
      alert("Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center bg-gray-50 border-b border-gray-100 p-5 pl-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center">
            <Bell className="w-5 h-5 mr-2 text-indigo-600" />
            Notification Preferences
          </h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900">Enable Reminders</p>
              <p className="text-sm text-gray-500">Show pop-up alerts for due follow-ups</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={notificationsEnabled}
                onChange={(e) => setNotificationsEnabled(e.target.checked)}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none ring-2 ring-transparent peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <div className={`space-y-3 transition-opacity ${notificationsEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
            <label className="block text-sm font-semibold text-gray-700">Notification Sound</label>
            <div className="grid grid-cols-1 gap-2">
              <div 
                onClick={() => setNotificationSound('chime')}
                className={`p-3 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all ${notificationSound === 'chime' ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-gray-100 hover:border-gray-200'}`}
              >
                <div className="flex items-center">
                  <Volume2 className={`w-4 h-4 mr-3 ${notificationSound === 'chime' ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <span className="font-medium">Chime</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); playNotificationSound('chime'); }}
                  className="text-xs font-bold text-indigo-600 px-3 py-1 bg-white border border-indigo-200 rounded text-center hover:bg-indigo-100"
                >
                  Preview
                </button>
              </div>

              <div 
                onClick={() => setNotificationSound('pop')}
                className={`p-3 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all ${notificationSound === 'pop' ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-gray-100 hover:border-gray-200'}`}
              >
                <div className="flex items-center">
                  <Volume2 className={`w-4 h-4 mr-3 ${notificationSound === 'pop' ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <span className="font-medium">Pop</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); playNotificationSound('pop'); }}
                  className="text-xs font-bold text-indigo-600 px-3 py-1 bg-white border border-indigo-200 rounded text-center hover:bg-indigo-100"
                >
                  Preview
                </button>
              </div>

              <div 
                onClick={() => setNotificationSound('digital')}
                className={`p-3 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all ${notificationSound === 'digital' ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-gray-100 hover:border-gray-200'}`}
              >
                <div className="flex items-center">
                  <Volume2 className={`w-4 h-4 mr-3 ${notificationSound === 'digital' ? 'text-indigo-600' : 'text-gray-400'}`} />
                  <span className="font-medium">Digital Alert</span>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); playNotificationSound('digital'); }}
                  className="text-xs font-bold text-indigo-600 px-3 py-1 bg-white border border-indigo-200 rounded text-center hover:bg-indigo-100"
                >
                  Preview
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 mr-3"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex items-center"
          >
            {isSaving ? 'Saving...' : showSuccess ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Preferences</>}
          </button>
        </div>
      </div>
    </div>
  );
}
