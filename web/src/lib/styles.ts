import { css } from 'lit';

/**
 * Shared Lit component styles using CSS custom properties from styles.css.
 * All colors/spacing reference --cp-* variables for theme support.
 */
export const sharedStyles = css`
  :host {
    display: block;
    width: 100%;
    font-family: var(--cp-font-sans);
    color: var(--cp-text);
  }

  .step-header {
    font-size: var(--cp-text-lg);
    font-weight: 600;
    margin-bottom: var(--cp-space-sm);
  }

  .step-desc {
    color: var(--cp-text-secondary);
    margin-bottom: var(--cp-space-lg);
    line-height: 1.5;
  }

  .field {
    margin-bottom: var(--cp-space-md);
  }

  .field label {
    display: block;
    font-size: var(--cp-text-sm);
    color: var(--cp-text-secondary);
    margin-bottom: 6px;
  }

  .field input,
  .field select {
    width: 100%;
    box-sizing: border-box;
    padding: var(--cp-space-sm) 0.75rem;
    background: var(--cp-input-bg);
    border: 1px solid var(--cp-border);
    border-radius: var(--cp-radius-sm);
    color: var(--cp-text);
    font-size: var(--cp-text-sm);
    outline: none;
    transition: border-color var(--cp-transition);
  }

  .field input:focus,
  .field select:focus {
    border-color: var(--cp-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--cp-primary) 25%, transparent);
  }

  .field input::placeholder {
    color: var(--cp-text-muted);
  }

  /* ── Buttons ─────────────────────────── */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--cp-space-sm);
    padding: var(--cp-space-sm) var(--cp-space-md);
    border: 1px solid var(--cp-border);
    border-radius: var(--cp-radius-sm);
    background: var(--cp-bg-surface);
    color: var(--cp-text);
    font-size: var(--cp-text-sm);
    cursor: pointer;
    transition:
      background var(--cp-transition),
      border-color var(--cp-transition),
      opacity var(--cp-transition);
    line-height: 1.4;
  }

  .btn:hover {
    background: var(--cp-bg-elevated);
    border-color: var(--cp-text-muted);
  }

  .btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--cp-primary);
    border-color: var(--cp-primary-hover);
    color: #fff;
  }

  .btn-primary:hover {
    background: var(--cp-primary-hover);
  }

  /* ── Status / badges ─────────────────── */
  .status-ok {
    color: var(--cp-success);
  }

  .status-pending {
    color: var(--cp-warning);
  }

  .status-error {
    color: var(--cp-error);
  }

  .badge {
    display: inline-block;
    padding: 2px var(--cp-space-sm);
    border-radius: var(--cp-radius-full);
    font-size: var(--cp-text-xs);
    font-weight: 500;
  }

  .badge-ok {
    background: var(--cp-success-bg);
    color: var(--cp-success);
    border: 1px solid var(--cp-success-border);
  }

  .badge-pending {
    background: var(--cp-warning-bg);
    color: var(--cp-warning);
    border: 1px solid var(--cp-warning-border);
  }

  /* ── Checkbox list ───────────────────── */
  .checkbox-list {
    display: flex;
    flex-direction: column;
    gap: var(--cp-space-sm);
  }

  .checkbox-list label {
    display: flex;
    align-items: center;
    gap: var(--cp-space-sm);
    cursor: pointer;
    font-size: var(--cp-text-sm);
  }

  .checkbox-list input[type='checkbox'] {
    accent-color: var(--cp-primary);
    width: 16px;
    height: 16px;
  }

  /* ── Cards / boxes ───────────────────── */
  .info-box {
    background: var(--cp-bg-surface);
    border: 1px solid var(--cp-border);
    border-radius: var(--cp-radius-md);
    padding: var(--cp-space-md);
    margin-bottom: var(--cp-space-md);
  }

  .code-display {
    font-family: var(--cp-font-mono);
    font-size: var(--cp-text-2xl);
    letter-spacing: 0.15em;
    text-align: center;
    background: var(--cp-gradient);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    padding: var(--cp-space-md);
  }

  /* ── Spinner ─────────────────────────── */
  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid var(--cp-border);
    border-top-color: var(--cp-primary);
    border-radius: 50%;
    animation: cp-spin 0.6s linear infinite;
  }

  @keyframes cp-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* ── Links ───────────────────────────── */
  a {
    color: var(--cp-accent);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
`;
