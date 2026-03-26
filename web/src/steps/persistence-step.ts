import { LitElement, html, css } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { sharedStyles } from '../lib/styles.js';

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
          }}
        />
        <label for="persist-toggle">
          Enable configuration backup (recommended)
        </label>
      </div>

      ${this.enabled
        ? html`
            <div class="field">
              <label>Repository name</label>
              <input
                type="text"
                placeholder="user/my-cawpilot"
                .value=${this.repo}
                @input=${(e: Event) => {
                  this.repo = (e.target as HTMLInputElement).value;
                }}
              />
            </div>
            <div
              style="font-size:var(--cp-text-xs);color:var(--cp-text-secondary)"
            >
              A private repo will be created if it doesn't exist. Your config,
              skills, and context files will be backed up daily.
            </div>
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
