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
        padding: var(--cp-space-sm) 0;
        border-bottom: 1px solid var(--cp-border-subtle);
        font-size: var(--cp-text-sm);
      }
      .summary-item:last-child {
        border-bottom: none;
      }
      .summary-label {
        color: var(--cp-text-secondary);
      }
      .done-message {
        text-align: center;
        padding: var(--cp-space-xl);
      }
      .done-message h2 {
        color: var(--cp-success);
        margin-bottom: var(--cp-space-md);
      }
      .done-message p {
        color: var(--cp-text-secondary);
      }
      .done-message .hint {
        margin-top: var(--cp-space-md);
        font-size: var(--cp-text-xs);
      }
    `,
  ];

  @state() saving = false;
  @state() done = false;
  @state() error = '';

  model = '';
  skills: string[] = [];
  channels: unknown[] = [];
  persistence: { enabled: boolean; repo: string; backupIntervalDays: number } =
    { enabled: false, repo: '', backupIntervalDays: 1 };

  override render() {
    if (this.done) {
      return html`
        <div class="done-message">
          <h2>✓ Setup Complete!</h2>
          <p>
            Configuration saved. The agent process will now exit and needs to be
            restarted to enter normal mode.
          </p>
          <p class="hint">
            In a container deployment, the restart is automatic. Locally, run
            <code>cawpilot start</code> again.
          </p>
          <p class="hint">
            Use /pair from the CLI or Telegram to link your account.
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
        <div class="summary-item">
          <span class="summary-label">Backup</span>
          <span>
            ${this.persistence.enabled
              ? this.persistence.repo
              : 'Disabled'}
          </span>
        </div>
      </div>

      ${this.error
        ? html`<div class="status-error" style="margin-bottom:var(--cp-space-md)">
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
          persistence: this.persistence,
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
