import React, { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { logOut } from '../lib/firebase';
import { LayoutDashboard, Users, Phone, LogOut, Menu, X, BellRing } from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout() {
  const { user } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [reminders, setReminders] = useState<any[]>([]);

  useEffect(() => {
    if (!user || user.role === 'hr') return;

    const checkReminders = async () => {
      try {
        const q = query(
          collection(db, 'leads'),
          where('assignedTo', '==', user.uid)
        );
        const snap = await getDocs(q);
        const now = new Date();
        
        const dueLeads = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as any))
          .filter(lead => 
            lead.status === 'call_back' && 
            lead.nextCallAt && 
            new Date(lead.nextCallAt) <= now
          );
        
        setReminders(dueLeads);
      } catch (error) {
        console.error("Failed to check reminders", error);
      }
    };

    // Check immediately and then every minute
    checkReminders();
    const interval = setInterval(checkReminders, 60000);

    return () => clearInterval(interval);
  }, [user]);

  if (!user) return null;

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard, roles: ['manager'] },
    { name: 'Team', path: '/team', icon: Users, roles: ['manager', 'hr'] },
    { name: 'Calling Queue', path: '/queue', icon: Phone, roles: ['manager', 'telecaller'] },
  ];

  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row font-sans relative">
      {/* Reminder Toasts */}
      {reminders.length > 0 && (
        <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
          {reminders.map((lead) => (
            <div key={lead.id} className="bg-white border-l-4 border-purple-500 shadow-xl rounded-lg p-4 max-w-sm w-full animate-in slide-in-from-right-8 fade-in">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <BellRing className="h-6 w-6 text-purple-500" />
                </div>
                <div className="ml-3 w-0 flex-1 pt-0.5">
                  <p className="text-sm font-bold text-gray-900">
                    Follow-up Call Due
                  </p>
                  <p className="mt-1 text-sm text-gray-500">
                    {lead.name} ({lead.phone})
                  </p>
                </div>
                <div className="ml-4 flex-shrink-0 flex">
                  <Link 
                    to="/queue"
                    onClick={() => setReminders(reminders.filter(r => r.id !== lead.id))} 
                    className="bg-purple-50 text-purple-700 px-3 py-1.5 rounded-md text-xs font-bold hover:bg-purple-100 transition-colors"
                  >
                    Go to Queue
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile Header */}
      <div className="md:hidden bg-gray-900 text-white h-16 flex items-center justify-between px-4 shadow-md z-20">
        <div className="flex items-center">
          <div className="bg-blue-600 p-1.5 rounded-lg mr-2 shadow-lg shadow-blue-900/20">
            <Phone className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight">TeleCRM</span>
        </div>
        <button 
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="p-2 text-gray-300 hover:text-white focus:outline-none"
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Sidebar Overlay (Mobile) */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-gray-900 shadow-xl flex flex-col text-gray-300 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-20 hidden md:flex items-center px-6 border-b border-gray-800">
          <div className="bg-blue-600 p-2 rounded-lg mr-3 shadow-lg shadow-blue-900/20">
            <Phone className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">TeleCRM</span>
        </div>
        
        <div className="flex-1 py-6 flex flex-col gap-2 px-4 overflow-y-auto">
          {navItems.filter(item => item.roles.includes(user.role)).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                onClick={closeMobileMenu}
                className={cn(
                  "flex items-center px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                  isActive 
                    ? "bg-blue-600 text-white shadow-md shadow-blue-900/20" 
                    : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                )}
              >
                <Icon className={cn("mr-3 h-5 w-5", isActive ? "text-white" : "text-gray-400")} />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-800 m-4 bg-gray-800/50 rounded-2xl">
          <div className="flex items-center mb-4">
            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold shadow-inner shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{user.name}</p>
              <p className="text-xs text-gray-400 capitalize truncate">{user.role}</p>
            </div>
          </div>
          <button
            onClick={() => {
              closeMobileMenu();
              logOut();
            }}
            className="flex items-center justify-center w-full px-4 py-2.5 text-sm font-medium text-red-400 bg-red-400/10 rounded-xl hover:bg-red-400/20 transition-colors"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="p-4 sm:p-8 max-w-7xl mx-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
