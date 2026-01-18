import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Trash2, Shield, CheckCircle, XCircle, Settings, Save } from 'lucide-react';

interface User {
  id: number;
  email: string;
  displayName: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Redirect if not admin
  if (!authLoading && (!user || !isAdmin)) {
    setLocation('/');
    return null;
  }

  // Fetch users
  const { data: users = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await fetch('/api/auth/users', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
  });

  // Update user role mutation
  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const response = await fetch(`/api/auth/users/${userId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to update role');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Success', description: 'User role updated successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update user role', variant: 'destructive' });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await fetch(`/api/auth/users/${userId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete user');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'Success', description: 'User deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete user', variant: 'destructive' });
    },
  });

  // Fetch settings
  const { data: settingsData, isLoading: settingsLoading } = useQuery<Record<string, string>>({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const response = await fetch('/api/settings', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch settings');
      return response.json();
    },
  });

  // Local state for editing
  const [geminiModel, setGeminiModel] = useState<string>('');

  // Update local state when data loads
  useEffect(() => {
    if (settingsData?.geminiModel) {
      setGeminiModel(settingsData.geminiModel);
    }
  }, [settingsData]);

  // Update setting mutation
  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const response = await fetch(`/api/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to update setting');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      toast({ title: 'Success', description: 'Setting updated successfully' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update setting', variant: 'destructive' });
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto p-4 md:p-8 max-w-7xl">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={() => setLocation('/')}
            className="mb-4 hover:bg-blue-50 border-blue-200 text-blue-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">Manage users and permissions</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              Manage user roles and access. Users can be either regular users or administrators.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Email Verified</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.displayName}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {u.emailVerified ? (
                          <div className="flex items-center text-green-600">
                            <CheckCircle className="w-4 h-4 mr-1" />
                            <span className="text-sm">Verified</span>
                          </div>
                        ) : (
                          <div className="flex items-center text-gray-500">
                            <XCircle className="w-4 h-4 mr-1" />
                            <span className="text-sm">Not Verified</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {u.lastLoginAt
                          ? new Date(u.lastLoginAt).toLocaleDateString()
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              updateRoleMutation.mutate({
                                userId: u.id,
                                role: u.role === 'admin' ? 'user' : 'admin',
                              })
                            }
                            disabled={u.id === user?.id}
                          >
                            {u.role === 'admin' ? 'Make User' : 'Make Admin'}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteUserMutation.mutate(u.id)}
                            disabled={u.id === user?.id}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <Settings className="w-5 h-5 text-blue-600" />
              <CardTitle>System Settings</CardTitle>
            </div>
            <CardDescription>
              Configure system-wide settings for the application.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="geminiModel">Gemini Model</Label>
                  <div className="flex gap-2">
                    <Input
                      id="geminiModel"
                      value={geminiModel}
                      onChange={(e) => setGeminiModel(e.target.value)}
                      placeholder="e.g., gemini-3-flash-preview"
                      className="flex-1"
                    />
                    <Button
                      onClick={() => updateSettingMutation.mutate({ key: 'geminiModel', value: geminiModel })}
                      disabled={updateSettingMutation.isPending || geminiModel === settingsData?.geminiModel}
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                  </div>
                  <p className="text-sm text-gray-500">
                    The Gemini model to use for AI-powered features. Current: <code className="bg-gray-100 px-1 rounded">{settingsData?.geminiModel || 'gemini-3-flash-preview'}</code>
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
