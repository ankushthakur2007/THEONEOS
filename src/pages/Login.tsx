import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = loginSchema.extend({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;

const Login: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const navigate = useNavigate();

  const form = useForm<LoginFormValues | SignupFormValues>({
    resolver: zodResolver(isSignUp ? signupSchema : loginSchema),
    defaultValues: {
      email: '',
      password: '',
      first_name: '',
      last_name: '',
    },
  });

  const onSubmit = async (values: LoginFormValues | SignupFormValues) => {
    if (isSignUp) {
      const { email, password, first_name, last_name } = values as SignupFormValues;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name,
            last_name,
          },
        },
      });

      if (error) {
        toast.error(`Sign up failed: ${error.message}`);
      } else if (data.user) {
        toast.success('Sign up successful! Please check your email to verify your account.');
        // Optionally redirect or show a message to verify email
        navigate('/home', { replace: true }); // Redirect to home after sign up
      }
    } else {
      const { email, password } = values as LoginFormValues;
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(`Sign in failed: ${error.message}`);
      } else {
        toast.success('Signed in successfully!');
        navigate('/home', { replace: true }); // Redirect to home after sign in
      }
    }
  };

  // Reset form fields when switching between sign-in/sign-up
  React.useEffect(() => {
    form.reset();
  }, [isSignUp, form.reset]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md p-6 space-y-4">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">THEONEOS</CardTitle>
          <CardDescription>{isSignUp ? 'Create an account' : 'Sign in to your account'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {isSignUp && (
                <>
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="m@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full">
                {isSignUp ? 'Sign Up' : 'Sign In'}
              </Button>
            </form>
          </Form>
          <div className="mt-4 text-center text-sm">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <Button variant="link" onClick={() => setIsSignUp(!isSignUp)} className="p-0 h-auto">
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;