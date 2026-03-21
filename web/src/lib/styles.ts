import { css } from 'lit';

export const sharedStyles = css`
  :host {
    display: block;
    width: 100%;
  }

  .step-header {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.5rem;
  }

  .step-desc {
    color: #8b949e;
    margin-bottom: 1.5rem;
    line-height: 1.5;
  }

  .field {
    margin-bottom: 1rem;
  }

  .field label {
    display: block;
    font-size: 0.875rem;
    color: #8b949e;
    margin-bottom: 0.375rem;
  }

  .field input,
  .field select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #e6edf3;
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.15s;
  }

  .field input:focus,
  .field select:focus {
    border-color: #58a6ff;
  }

  .field input::placeholder {
    color: #484f58;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid #30363d;
    border-radius: 6px;
    background: #21262d;
    color: #e6edf3;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .btn:hover {
    background: #30363d;
    border-color: #8b949e;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #238636;
    border-color: #2ea043;
    color: #fff;
  }

  .btn-primary:hover {
    background: #2ea043;
    border-color: #3fb950;
  }

  .status-ok {
    color: #3fb950;
  }

  .status-pending {
    color: #d29922;
  }

  .status-error {
    color: #f85149;
  }

  .badge {
    display: inline-block;
    padding: 0.125rem 0.5rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .badge-ok {
    background: #0d2818;
    color: #3fb950;
    border: 1px solid #238636;
  }

  .badge-pending {
    background: #2a1f00;
    color: #d29922;
    border: 1px solid #9e6a03;
  }

  .checkbox-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .checkbox-list label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
  }

  .checkbox-list input[type='checkbox'] {
    accent-color: #238636;
    width: 16px;
    height: 16px;
  }

  .info-box {
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
  }

  .code-display {
    font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo,
      monospace;
    font-size: 2rem;
    letter-spacing: 0.15em;
    text-align: center;
    color: #58a6ff;
    padding: 1rem;
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #30363d;
    border-top-color: #58a6ff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
