'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { TopBar } from '@/components/dashboard/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const tabs = ['Profile', 'Notifications', 'Integrations', 'Danger Zone']

const integrations = [
  { name: 'Slack', description: 'Send incident alerts to Slack channels', icon: '💬', connected: true },
  { name: 'PagerDuty', description: 'Sync on-call schedules and escalations', icon: '📟', connected: false },
  { name: 'Datadog', description: 'Import metrics and traces automatically', icon: '🐶', connected: false },
]

const notificationSettings = [
  { label: 'New incident created', key: 'newIncident', enabled: true },
  { label: 'Incident escalated to P1', key: 'p1Escalation', enabled: true },
  { label: 'Assigned as commander', key: 'commanderAssign', enabled: true },
  { label: 'Incident resolved', key: 'resolved', enabled: false },
  { label: 'Weekly digest', key: 'weeklyDigest', enabled: true },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('Profile')
  const [notifications, setNotifications] = useState(
    Object.fromEntries(notificationSettings.map((n) => [n.key, n.enabled]))
  )

  return (
    <div>
      <TopBar title="Settings" />
      <div className="p-6 max-w-3xl">
        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 mb-8 w-fit">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                activeTab === tab
                  ? 'bg-white/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'Profile' && (
            <div className="glass rounded-2xl p-6 space-y-6">
              <h2 className="font-semibold text-lg">Profile</h2>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-xl font-semibold">
                  DU
                </div>
                <div>
                  <Button variant="outline" size="sm">Change avatar</Button>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG up to 4MB</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" defaultValue="Demo" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" defaultValue="User" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" defaultValue="demo@warroom.ai" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org">Organization</Label>
                <Input id="org" defaultValue="War Room AI" />
              </div>
              <Button>Save changes</Button>
            </div>
          )}

          {activeTab === 'Notifications' && (
            <div className="glass rounded-2xl p-6 space-y-6">
              <h2 className="font-semibold text-lg">Notification Preferences</h2>
              <div className="space-y-4">
                {notificationSettings.map((setting) => (
                  <div key={setting.key} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                    <span className="text-sm">{setting.label}</span>
                    <button
                      onClick={() => setNotifications((prev) => ({ ...prev, [setting.key]: !prev[setting.key] }))}
                      className={cn(
                        'relative w-10 h-5 rounded-full transition-colors',
                        notifications[setting.key] ? 'bg-indigo-500' : 'bg-white/10'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform',
                          notifications[setting.key] ? 'translate-x-5' : 'translate-x-0.5'
                        )}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'Integrations' && (
            <div className="space-y-4">
              {integrations.map((integration) => (
                <div key={integration.name} className="glass rounded-2xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">
                      {integration.icon}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{integration.name}</p>
                      <p className="text-xs text-muted-foreground">{integration.description}</p>
                    </div>
                  </div>
                  <Button variant={integration.connected ? 'outline' : 'default'} size="sm">
                    {integration.connected ? 'Disconnect' : 'Connect'}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'Danger Zone' && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 space-y-4">
              <h2 className="font-semibold text-lg text-red-400">Danger Zone</h2>
              <p className="text-sm text-muted-foreground">
                These actions are irreversible. Please proceed with caution.
              </p>
              <div className="flex items-center justify-between py-4 border-t border-red-500/20">
                <div>
                  <p className="text-sm font-medium">Delete account</p>
                  <p className="text-xs text-muted-foreground">Permanently delete your account and all data</p>
                </div>
                <Button variant="destructive" size="sm">Delete account</Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
