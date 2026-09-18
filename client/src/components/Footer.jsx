import React from 'react';
import { APP_VERSION } from '../version';

/**
 * Shared attribution footer.
 *
 *   inline   - sits at the end of the main container (default)
 *   sidebar  - pinned to the bottom of the reports sidebar
 *   floating - centred over a full-screen overlay, e.g. the sign-in screen
 */
function Footer({ variant = 'inline' }) {
  return (
    <footer className={`app-footer app-footer--${variant}`}>
      <p>
        Developed and maintained by <span className="rdj">RDJ(MRM)</span>
        <span className="app-footer-sep">&middot;</span>
        <span className="app-footer-version">v{APP_VERSION}</span>
      </p>
    </footer>
  );
}

export default Footer;
