import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../lib/styles.js';
import { api } from '../lib/api.js';

@customElement('complete-step')
export class CompleteStep extends LitElement {
  static override styles = [
    sharedStyles,
    css`
      .summary-item {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem 0;
        border-bottom: 1px solid #21262d;
        font-size: 0.875rem;
      }
      .summary-item:last-child {
        border-bottom: none;
      }
      .summary-label {
        color: #8b949e;
      }
      .done-message {
        text-align: center;
        padding: 2rem;
      }
      .done-message h2 {
        color: #3fb950;
        margin-bottom: 1rem;
      }
    `,
  ];

  @state() saving = false;
  @state() done = false;
  @state() error = '';

  model = '';
  skills: string[] = [];
  channels: unknown[] = [];

  override render() {
    if (this.done) {
      return html`
        <div class="done-message">
          <h2>✓ Setup Complete!</h2>
          <p style="color:#8b949e">
            Your agent is restarting and will be ready shortly.
          </p>
          <p style="color:#8b949e;margin-top:1rem;font-size:0.8rem">
            You can close this page. Use /pair from the CLI or Telegram to link
            your account.
          </p>
        </div>
      `;
    }

    return html`
      <div class="step-header">Review & Save</div>
      <div class="step-desc">
        Confirm your configuration and start the agent.
      </div>

      <div class="info-box">
        <div class="summary-item">
          <span class="summary-label">Model</span>
          <span>${this.model || 'gpt-4.1'}</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Skills</span>
          <span>${this.skills.length} enabled</span>
        </div>
        <div class="summary-item">
          <span class="summary-label">Channels</span>
          <span>${this.channels.length} configured</span>
        </div>
      </div>

      ${this.error
        ? html`<div class="status-error" style="margin-bottom:1rem">
            ${this.error}
          </div>`
        : ''}

      <button
        class="btn btn-primary"
        ?disabled=${this.saving}
        @click=${this.save}
        style="width:100%;justify-content:center;padding:0.75rem"
      >
        ${this.saving
          ? html`<span class="spinner"></span> Saving...`
          : 'Save & Start Agent'}
      </button>
    `;
  }

  private async save() {
    this.saving = true;
    this.error = '';

    try {
      await api('/complete', {
        method: 'POST',
        body: JSON.stringify({
          model: this.model,
          skills: this.skills,
          channels: this.channels,
        }),
      });
      this.done = true;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to save';
    }

    this.saving = false;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'complete-step': CompleteStep;
  }
}
