import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../lib/styles.js';
import { api, apiSSE } from '../lib/api.js';

@customElement('auth-step')
export class AuthStep extends LitElement {
  static override styles = [
    sharedStyles,
    css`
      .section {
        margin-bottom: var(--cp-space-lg);
      }
      .section-title {
        font-size: var(--cp-text-sm);
        font-weight: 600;
        margin-bottom: var(--cp-space-sm);
        display: flex;
        align-items: center;
        gap: var(--cp-space-sm);
      }
    `,
  ];

  @state() ghUser = '';
  @state() ghLoading = false;
  @state() ghToken = '';
  @state() ghError = '';

  @state() copilotLogin = '';
  @state() copilotLoading = false;
  @state() copilotCode = '';
  @state() copilotUrl = '';
  @state() copilotError = '';
  @state() copilotRaw: string[] = [];

  override connectedCallback() {
    super.connectedCallback();
    void this.checkStatus();
  }

  private notifyChange() {
    this.dispatchEvent(
      new CustomEvent('auth-changed', { bubbles: true, composed: true }),
    );
  }

  private async checkStatus() {
    try {
      const gh = await api<{ authenticated: boolean; user?: string }>(
        '/gh-auth',
      );
      if (gh.authenticated) {
        this.ghUser = gh.user ?? 'authenticated';
      }

      const copilot = await api<{ authenticated: boolean; login?: string }>(
        '/copilot-auth',
      );
      if (copilot.authenticated) {
        this.copilotLogin = copilot.login ?? 'authenticated';
      }
    } catch {
      // Status checks are non-critical
    }

    this.notifyChange();
  }

  private async submitGhToken() {
    if (!this.ghToken.trim()) return;
    this.ghLoading = true;
    this.ghError = '';

    try {
      const result = await api<{ authenticated: boolean; user?: string }>(
        '/gh-auth',
        {
          method: 'POST',
          body: JSON.stringify({ token: this.ghToken }),
        },
      );
      if (result.authenticated) {
        this.ghUser = result.user ?? 'authenticated';
        this.ghToken = '';
      } else {
        this.ghError = 'Authentication failed';
      }
    } catch (err) {
      this.ghError =
        err instanceof Error ? err.message : 'Authentication failed';
    }

    this.ghLoading = false;
    this.notifyChange();
  }

  private startCopilotLogin() {
    this.copilotLoading = true;
    this.copilotError = '';
    this.copilotCode = '';
    this.copilotRaw = [];

    apiSSE(
      '/copilot-login',
      (event) => {
        switch (event.type) {
          case 'code': {
            this.copilotCode = event.code as string;
            this.copilotUrl =
              (event.url as string) || 'https://github.com/login/device';
            break;
          }

          case 'done': {
            this.copilotLogin = (event.login as string) || 'authenticated';
            this.copilotLoading = false;
            this.copilotCode = '';
            this.notifyChange();
            break;
          }

          case 'error': {
            this.copilotError = (event.message as string) || 'Login failed';
            this.copilotLoading = false;
            break;
          }

          case 'raw': {
            this.copilotRaw = [...this.copilotRaw, event.text as string];
            break;
          }
        }
      },
      () => {
        this.copilotLoading = false;
      },
    );
  }

  get isComplete() {
    return Boolean(this.ghUser) && Boolean(this.copilotLogin);
  }

  override render() {
    return html`
      <div class="step-header">Authentication</div>
      <div class="step-desc">
        Connect your GitHub and Copilot accounts to get started.
      </div>

      <div class="section">
        <div class="section-title">
          GitHub CLI
          ${this.ghUser
            ? html`<span class="badge badge-ok">✓ ${this.ghUser}</span>`
            : html`<span class="badge badge-pending">Not connected</span>`}
        </div>

        ${this.ghUser
          ? ''
          : html`
              <div class="field">
                <label>Personal Access Token</label>
                <input
                  type="password"
                  placeholder="ghp_..."
                  .value=${this.ghToken}
                  @input=${(e: Event) => {
                    this.ghToken = (e.target as HTMLInputElement).value;
                  }}
                  @keydown=${(e: KeyboardEvent) => {
                    if (e.key === 'Enter') void this.submitGhToken();
                  }}
                />
              </div>
              <button
                class="btn btn-primary"
                ?disabled=${this.ghLoading || !this.ghToken.trim()}
                @click=${this.submitGhToken}
              >
                ${this.ghLoading
                  ? html`<span class="spinner"></span> Authenticating...`
                  : 'Authenticate'}
              </button>
              ${this.ghError
                ? html`<div class="status-error" style="margin-top:0.5rem">
                    ${this.ghError}
                  </div>`
                : ''}
            `}
      </div>

      <div class="section">
        <div class="section-title">
          GitHub Copilot
          ${this.copilotLogin
            ? html`<span class="badge badge-ok">✓ ${this.copilotLogin}</span>`
            : html`<span class="badge badge-pending">Not connected</span>`}
        </div>

        ${this.copilotLogin
          ? ''
          : this.copilotCode
            ? html`
                <div class="info-box">
                  <div
                    style="color:var(--cp-text-secondary);margin-bottom:0.5rem"
                  >
                    Enter this code at:
                  </div>
                  <div class="code-display">${this.copilotCode}</div>
                  <div style="text-align:center;margin-top:0.5rem">
                    <a
                      href="${this.copilotUrl}"
                      target="_blank"
                      rel="noopener"
                      >${this.copilotUrl}</a
                    >
                  </div>
                  <div
                    style="text-align:center;margin-top:1rem;color:var(--cp-text-secondary);font-size:var(--cp-text-xs)"
                  >
                    <span class="spinner"></span> Waiting for authorization...
                  </div>
                </div>
              `
            : html`
                <button
                  class="btn"
                  ?disabled=${this.copilotLoading}
                  @click=${this.startCopilotLogin}
                >
                  ${this.copilotLoading
                    ? html`<span class="spinner"></span> Starting login...`
                    : 'Start Copilot Login'}
                </button>
                ${this.copilotError
                  ? html`<div class="status-error" style="margin-top:0.5rem">
                      ${this.copilotError}
                    </div>`
                  : ''}
                ${this.copilotRaw.length > 0
                  ? html`<pre
                      style="margin-top:0.5rem;font-size:var(--cp-text-xs);color:var(--cp-text-secondary);white-space:pre-wrap"
                    >
${this.copilotRaw.join('\n')}</pre
                    >`
                  : ''}
              `}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'auth-step': AuthStep;
  }
}
