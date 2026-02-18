import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { authApi, clearAccessToken } from '../lib/auth';

interface User {
  id: string;
  email: string;
  role: 'admin' | 'viewer';
}

export function useAuth() {
  return useQuery<User>({
    queryKey: ['me'],
    queryFn: () => authApi.get<User>('/auth/me').then((r) => r.data),
    retry: false,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: () => axios.post('/api/auth/logout'),
    onSuccess: () => {
      clearAccessToken();
      queryClient.clear();
      navigate('/login');
    },
  });
}
