import { LitElement, html, css } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { sharedStyles } from '../lib/styles.js';
import { api } from '../lib/api.js';

@customElement('persistence-step')
export class PersistenceStep extends LitElement {
  static override styles = [
    sharedStyles,
    css`
      .toggle-row {
        display: flex;
        align-items: center;
        gap: var(--cp-space-sm);
        margin-bottom: var(--cp-space-md);
      }
      .toggle-row label {
        cursor: pointer;
        font-size: var(--cp-text-sm);
      }
      .toggle-row input[type='checkbox'] {
        accent-color: var(--cp-primary);
        width: 16px;
        height: 16px;
      }
      .repo-exists-banner {
        background: var(--cp-bg-elevated);
        border: 1px solid var(--cp-border);
        border-radius: var(--cp-radius-md);
        padding: var(--cp-space-md);
        margin-top: var(--cp-space-md);
        font-size: var(--cp-text-sm);
      }
      .repo-exists-banner p {
        margin-bottom: var(--cp-space-sm);
      }
      .repo-actions {
        display: flex;
        gap: var(--cp-space-sm);
        margin-top: var(--cp-space-sm);
      }
      .repo-actions .btn {
        font-size: var(--cp-text-sm);
        padding: 6px 14px;
      }
      .restore-status {
        margin-top: var(--cp-space-sm);
        font-size: var(--cp-text-xs);
      }
      .restore-status.success {
        color: var(--cp-success);
      }
      .restore-status.error {
        color: var(--cp-error);
      }
    `,
  ];

  @property({ type: String }) ghUser = '';
  @property({ type: Object }) initialPersistence: {
    enabled: boolean;
    repo: string;
    backupIntervalDays: number;
  } = { enabled: true, repo: '', backupIntervalDays: 1 };

  @state() enabled = true;
  @state() repo = '';
  @state() initialized = false;
  @state() checking = false;
  @state() repoExistsResult: boolean | null = null;
  @state() restoreConfirmed: boolean | null = null;
  @state() restoreStatus: 'idle' | 'restoring' | 'success' | 'error' = 'idle';

  override connectedCallback() {
    super.connectedCallback();
    this.applyInitial();
  }

  override updated(changed: Map<string, unknown>) {
    if (!this.initialized) {
      this.applyInitial();
    }
  }

  private applyInitial() {
    if (this.initialized) return;
    if (this.initialPersistence.repo) {
      this.enabled = this.initialPersistence.enabled;
      this.repo = this.initialPersistence.repo;
      this.initialized = true;
    } else if (this.ghUser) {
      this.repo = `${this.ghUser}/my-cawpilot`;
      this.initialized = true;
    }
  }

  get persistence() {
    return {
      enabled: this.enabled,
      repo: this.enabled ? this.repo : '',
      backupIntervalDays: 1,
    };
  }

  private async checkRepo() {
    if (!this.repo) return;
    this.checking = true;
    this.repoExistsResult = null;
    this.restoreConfirmed = null;
    this.restoreStatus = 'idle';
    try {
      const result = await api<{ exists: boolean }>('/check-repo', {
        method: 'POST',
        body: JSON.stringify({ repo: this.repo }),
      });
      this.repoExistsResult = result.exists;
    } catch {
      this.repoExistsResult = false;
    } finally {
      this.checking = false;
    }
  }

  private handleRepoInput(e: Event) {
    this.repo = (e.target as HTMLInputElement).value;
    this.repoExistsResult = null;
    this.restoreConfirmed = null;
    this.restoreStatus = 'idle';
  }

  private async handleRestore() {
    this.restoreStatus = 'restoring';
    this.restoreConfirmed = true;
    try {
      const result = await api<{
        success: boolean;
        message: string;
        config?: {
          channels: unknown[];
          models: { orchestrator: string; task: string };
          skills: string[];
          persistence: {
            enabled: boolean;
            repo: string;
            backupIntervalDays: number;
          };
        };
      }>('/restore-backup', {
        method: 'POST',
        body: JSON.stringify({ repo: this.repo }),
      });
      if (result.success && result.config) {
        this.restoreStatus = 'success';
        this.dispatchEvent(
          new CustomEvent('config-restored', {
            detail: result.config,
            bubbles: true,
            composed: true,
          }),
        );
      } else {
        this.restoreStatus = 'error';
      }
    } catch {
      this.restoreStatus = 'error';
    }
  }

  private handleChangeRepo() {
    this.restoreConfirmed = null;
    this.repoExistsResult = null;
    this.repo = '';
    // Focus the input after render
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector(
        'input[type="text"]',
      ) as HTMLInputElement;
      input?.focus();
    });
  }

  override render() {
    return html`
      <div class="step-header">Backup</div>
      <div class="step-desc">
        Optionally back up your configuration to a private GitHub repo.
      </div>

      <div class="toggle-row">
        <input
          type="checkbox"
          id="persist-toggle"
          .checked=${this.enabled}
          @change=${(e: Event) => {
            this.enabled = (e.target as HTMLInputElement).checked;
            this.repoExistsResult = null;
            this.restoreConfirmed = null;
          }}
        />
        <label for="persist-toggle">
          Enable configuration backup (recommended)
        </label>
      </div>

      ${this.enabled
        ? html`
            <div class="field">
              <label>Repository name (user/repo)</label>
              <div style="display:flex;gap:var(--cp-space-sm)">
                <input
                  type="text"
                  placeholder="user/my-cawpilot"
                  .value=${this.repo}
                  @input=${this.handleRepoInput}
                  style="flex:1"
                />
                <button
                  class="btn btn-primary"
                  ?disabled=${!this.repo || this.checking}
                  @click=${this.checkRepo}
                  style="white-space:nowrap"
                >
                  ${this.checking ? 'Checking...' : 'Check'}
                </button>
              </div>
            </div>

            ${this.repoExistsResult === false
              ? html`
                  <div
                    style="font-size:var(--cp-text-xs);color:var(--cp-text-secondary);margin-top:var(--cp-space-sm)"
                  >
                    A private repo will be created. Your config, skills, and
                    context files will be backed up daily.
                  </div>
                `
              : ''}
            ${this.repoExistsResult === true && this.restoreConfirmed === null
              ? html`
                  <div class="repo-exists-banner">
                    <p>
                      Repository <strong>${this.repo}</strong> already exists.
                    </p>
                    <p>Restore your configuration from this backup?</p>
                    <div class="repo-actions">
                      <button
                        class="btn btn-primary"
                        @click=${this.handleRestore}
                      >
                        Yes, restore
                      </button>
                      <button class="btn" @click=${this.handleChangeRepo}>
                        No, change repo
                      </button>
                    </div>
                  </div>
                `
              : ''}
            ${this.restoreConfirmed === true
              ? html`
                  <div class="repo-exists-banner">
                    ${this.restoreStatus === 'restoring'
                      ? html`<span class="spinner"></span> Restoring from
                          <strong>${this.repo}</strong>...`
                      : this.restoreStatus === 'success'
                        ? html`✓ Configuration restored from
                            <strong>${this.repo}</strong>.`
                        : html`⚠ Could not restore — will start fresh.`}
                  </div>
                `
              : ''}
            ${this.repoExistsResult === null && !this.checking
              ? html`
                  <div
                    style="font-size:var(--cp-text-xs);color:var(--cp-text-secondary);margin-top:var(--cp-space-sm)"
                  >
                    Click "Check" to verify repository availability.
                  </div>
                `
              : ''}
          `
        : ''}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'persistence-step': PersistenceStep;
  }
}
