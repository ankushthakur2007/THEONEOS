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

interface Profile {
  first_name: string;
  last_name: string;
}

const Settings: React.FC = () => {
  const { session, supabase } = useSession();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      if (session?.user) {
        setLoading(true);
        const { data, error } = await supabase
          .from('profiles')
          .select('first_name, last_name')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
        } else {
          setProfile(data);
        }
        setLoading(false);
      }
    };

    fetchProfile();
  }, [session, supabase]);

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
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Settings;