import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext();

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  accessToken: null,
  error: null
};

const authReducer = (state, action) => {
  switch (action.type) {
    case 'SET_USER':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        isLoading: false,
        error: null
      };
    case 'SET_TOKENS':
      return {
        ...state,
        accessToken: action.payload.accessToken
      };
    case 'SET_LOADING':
      return {
        ...state,
        isLoading: action.payload
      };
    case 'SET_ERROR':
      return {
        ...state,
        error: action.payload,
        isLoading: false
      };
    case 'LOGOUT':
      return {
        ...initialState,
        isLoading: false
      };
    default:
      return state;
  }
};

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check authentication on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const storedUser = localStorage.getItem('user');

        if (token && storedUser) {
          try {
            const res = await authApi.getCurrentUser();
            dispatch({ type: 'SET_USER', payload: res.data });
            dispatch({ type: 'SET_TOKENS', payload: { accessToken: token } });
          } catch (error) {
            // Token invalid, clear and logout
            localStorage.clear();
            dispatch({ type: 'LOGOUT' });
          }
        } else {
          // No tokens, not authenticated
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (error) {
        console.error('Auth check error:', error);
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    checkAuth();

    // Safety timeout to ensure loading state doesn't hang
    const timeout = setTimeout(() => {
      dispatch({ type: 'SET_LOADING', payload: false });
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);

  // Auto-refresh token before expiry
  useEffect(() => {
    if (!state.accessToken) return;

    try {
      const payload = JSON.parse(atob(state.accessToken.split('.')[1]));
      const expiryTime = payload.exp * 1000;
      const refreshTime = expiryTime - Date.now() - 60000; // 1 min before expiry

      if (refreshTime > 0) {
        const timer = setTimeout(async () => {
          try {
            const refreshToken = localStorage.getItem('refreshToken');
            const res = await authApi.refreshToken(refreshToken);
            localStorage.setItem('accessToken', res.data.accessToken);
            dispatch({ type: 'SET_TOKENS', payload: { accessToken: res.data.accessToken } });
          } catch (error) {
            logout();
          }
        }, refreshTime);

        return () => clearTimeout(timer);
      }
    } catch (error) {
      console.error('Token refresh setup error:', error);
    }
  }, [state.accessToken]);

  const login = async (email, password) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const res = await authApi.login({ email, password });

      localStorage.setItem('accessToken', res.data.accessToken);
      localStorage.setItem('refreshToken', res.data.refreshToken);
      localStorage.setItem('user', JSON.stringify(res.data.user));

      dispatch({ type: 'SET_USER', payload: res.data.user });
      dispatch({ type: 'SET_TOKENS', payload: { accessToken: res.data.accessToken } });

      return { success: true };
    } catch (error) {
      const message = error.response?.data?.message || 'Login failed';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, error: message };
    }
  };

  const register = async (email, password, name) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const res = await authApi.register({ email, password, name });
      dispatch({ type: 'SET_LOADING', payload: false });
      return { success: true, message: res.data.message };
    } catch (error) {
      const message = error.response?.data?.message || 'Registration failed';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, error: message };
    }
  };

  const verifyEmail = async (token) => {
    try {
      dispatch({ type: 'SET_LOADING', payload: true });
      const res = await authApi.verifyEmail(token);

      if (res.data.accessToken) {
        localStorage.setItem('accessToken', res.data.accessToken);
        localStorage.setItem('refreshToken', res.data.refreshToken);
        localStorage.setItem('user', JSON.stringify(res.data.user));

        dispatch({ type: 'SET_USER', payload: res.data.user });
        dispatch({ type: 'SET_TOKENS', payload: { accessToken: res.data.accessToken } });
      }

      return { success: true, message: res.data.message };
    } catch (error) {
      const message = error.response?.data?.message || 'Verification failed';
      dispatch({ type: 'SET_ERROR', payload: message });
      return { success: false, error: message };
    }
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    dispatch({ type: 'LOGOUT' });
  };

  const forgotPassword = async (email) => {
    try {
      const res = await authApi.forgotPassword(email);
      return { success: true, message: res.data.message, resetUrl: res.data.resetUrl };
    } catch (error) {
      const message = error.response?.data?.message || 'Request failed';
      return { success: false, error: message };
    }
  };

  const resetPassword = async (token, newPassword) => {
    try {
      const res = await authApi.resetPassword(token, newPassword);
      return { success: true, message: res.data.message };
    } catch (error) {
      const message = error.response?.data?.message || 'Password reset failed';
      return { success: false, error: message };
    }
  };

  return (
    <AuthContext.Provider value={{
      ...state,
      login,
      register,
      logout,
      verifyEmail,
      forgotPassword,
      resetPassword
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
