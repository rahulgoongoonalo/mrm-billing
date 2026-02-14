import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const VerifyEmail = ({ token }) => {
  const [status, setStatus] = useState('verifying'); // 'verifying', 'success', 'error'
  const [message, setMessage] = useState('');
  const { verifyEmail } = useAuth();

  useEffect(() => {
    const verify = async () => {
      const result = await verifyEmail(token);
      if (result.success) {
        setStatus('success');
        setMessage(result.message);
        // Redirect handled by AuthContext (auto-login)
      } else {
        setStatus('error');
        setMessage(result.error);
      }
    };

    verify();
  }, [token, verifyEmail]);

  return (
    <div className="verify-email-container">
      <div className="verify-email-card">
        {status === 'verifying' && (
          <>
            <div className="spinner"></div>
            <h2>Verifying your email...</h2>
            <p>Please wait while we verify your account.</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="success-icon">✓</div>
            <h2>Email Verified!</h2>
            <p>{message}</p>
            <p>Redirecting you to the app...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <div className="error-icon">✕</div>
            <h2>Verification Failed</h2>
            <p>{message}</p>
            <button onClick={() => window.location.href = '/'} className="btn btn-primary">
              Go to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default VerifyEmail;
