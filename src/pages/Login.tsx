import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

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
    defaultValues: { email: '', password: '', first_name: '', last_name: '' },
  });

  const onSubmit = async (values: LoginFormValues | SignupFormValues) => {
    if (isSignUp) {
      const { email, password, first_name, last_name } = values as SignupFormValues;
      const { data, error } = await supabase.auth.signUp({
        email, password, options: { data: { first_name, last_name } },
      });
      if (error) toast.error(`Sign up failed: ${error.message}`);
      else if (data.user) {
        toast.success('Sign up successful! Please check your email to verify your account.');
        navigate('/home', { replace: true });
      }
    } else {
      const { email, password } = values as LoginFormValues;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) toast.error(`Sign in failed: ${error.message}`);
      else {
        toast.success('Signed in successfully!');
        navigate('/home', { replace: true });
      }
    }
  };

  React.useEffect(() => {
    form.reset();
  }, [isSignUp, form.reset]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm space-y-8"
      >
        <div className="text-center">
          <h1 className="text-6xl font-bold text-primary tracking-tighter">J</h1>
          <p className="text-2xl font-medium mt-2">Welcome to THEONEOS</p>
          <p className="text-muted-foreground mt-1">{isSignUp ? 'Create your account to begin.' : 'Sign in to continue.'}</p>
        </div>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {isSignUp && (
              <div className="flex gap-4">
                <FormField control={form.control} name="first_name" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>First Name</FormLabel><FormControl><Input placeholder="John" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="last_name" render={({ field }) => (
                  <FormItem className="flex-1"><FormLabel>Last Name</FormLabel><FormControl><Input placeholder="Doe" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            )}
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" placeholder="m@example.com" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <FormField control={form.control} name="password" render={({ field }) => (
              <FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" placeholder="••••••••" {...field} /></FormControl><FormMessage /></FormItem>
            )} />
            <Button type="submit" className="w-full !mt-6 h-11 text-base font-semibold">
              {isSignUp ? 'Create Account' : 'Sign In'}
            </Button>
          </form>
        </Form>

        <div className="text-center text-sm">
          <span className="text-muted-foreground">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}
          </span>{' '}
          <Button variant="link" onClick={() => setIsSignUp(!isSignUp)} className="p-0 h-auto font-semibold">
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;