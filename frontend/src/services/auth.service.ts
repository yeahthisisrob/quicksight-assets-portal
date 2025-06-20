import { config } from '../config';

export const authService = {
  async checkAuth(): Promise<boolean> {
    try {
      const apiUrl = config.API_URL.replace('/api', '');
      const response = await fetch(`${apiUrl}/auth/session`, {
        credentials: 'include',
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.authenticated;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking auth:', error);
      return false;
    }
  }
};