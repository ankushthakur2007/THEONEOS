import React, { useEffect, useState } from 'react';
import { useSession } from '@/components/SessionContextProvider';
import { useTheme } from '@/components/ThemeProvider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface Profile {
  first_name: string;
  last_name: string;
}

interface Preferences {
  ai_personality: string;
}

const Settings: React.FC = () => {
  const { session, supabase } = useSession();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({ ai_personality: 'default' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchInitialData = async () => {
      if (session?.user) {
        setLoading(true);
        
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.user.id)
          .single();

        if (profileError) {
          console.error('Error fetching profile:', profileError);
        } else {
          setProfile(profileData);
        }

        const { data: prefsData, error: prefsError } = await supabase
          .from('user_preferences')
          .select('prefs')
          .eq('user_id', session.user.id)
          .single();

        if (prefsError && prefsError.code !== 'PGRST116') {
          console.error('Error fetching preferences:', prefsError);
        } else if (prefsData) {
          setPreferences(prefsData.prefs as Preferences);
        }

        setLoading(false);
      }
    };

    fetchInitialData();
  }, [session, supabase]);

  const handleSaveChanges = async () => {
    if (!session?.user) return;
    setSaving(true);
    const { error } = await supabase
      .from('user_preferences')
      .upsert({ user_id: session.user.id, prefs: preferences }, { onConflict: 'user_id' });

    if (error) {
      toast.error(`Failed to save preferences: ${error.message}`);
    } else {
      toast.success('Preferences saved successfully!');
    }
    setSaving(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-6 lg:p-8 animate-fade-in">
      <div className="max-w-2xl mx-auto">
        <Button variant="ghost" onClick={() => navigate('/home')} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>Manage your profile and application settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-lg font-medium">Profile</h3>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-1/2 animate-pulse" />
                  <Skeleton className="h-6 w-1/3 animate-pulse" />
                </div>
              ) : profile ? (
                <div className="space-y-1">
                  <p><strong>Name:</strong> {profile.first_name} {profile.last_name}</p>
                  <p><strong>Email:</strong> {session?.user?.email}</p>
                </div>
              ) : (
                <p>Could not load profile information.</p>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-medium">Appearance</h3>
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label htmlFor="theme-switch" className="text-base">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">
                    Toggle between light and dark themes.
                  </p>
                </div>
                <Switch
                  id="theme-switch"
                  checked={theme === 'dark'}
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium">AI Customization</h3>
              <div className="rounded-lg border p-4 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ai-personality">AI Personality</Label>
                  <p className="text-sm text-muted-foreground">
                    Choose how you want JARVIS to respond.
                  </p>
                  {loading ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select
                      value={preferences.ai_personality}
                      onValueChange={(value) => setPreferences(p => ({ ...p, ai_personality: value }))}
                    >
                      <SelectTrigger id="ai-personality">
                        <SelectValue placeholder="Select a personality" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Default (Helpful Assistant)</SelectItem>
                        <SelectItem value="witty">Witty & Sarcastic</SelectItem>
                        <SelectItem value="formal">Formal & Professional</SelectItem>
                        <SelectItem value="pirate">A Swashbuckling Pirate</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <Button onClick={handleSaveChanges} disabled={saving || loading}>
                  {saving ? 'Saving...' : 'Save Preferences'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;