import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from './lib/styles.js';
import { initApi, api } from './lib/api.js';
import type { AuthStep } from './steps/auth-step.js';
import type { ChannelsStep } from './steps/channels-step.js';
import type { ModelStep } from './steps/model-step.js';
import type { SkillsStep } from './steps/skills-step.js';
import type { PersistenceStep } from './steps/persistence-step.js';

const STEPS = [
  'auth',
  'backup',
  'channels',
  'model',
  'skills',
  'complete',
] as const;
type StepName = (typeof STEPS)[number];

const STEP_LABELS: Record<StepName, string> = {
  auth: 'Auth',
  backup: 'Backup',
  channels: 'Channels',
  model: 'Model',
  skills: 'Skills',
  complete: 'Launch',
};

@customElement('setup-app')
export class SetupApp extends LitElement {
  static override styles = [
    sharedStyles,
    css`
      :host {
        max-width: 560px;
        width: 100%;
      }

      /* ── Header ─────────────────────── */
      .header {
        text-align: center;
        margin-bottom: var(--cp-space-xl);
      }

      .header-logo {
        width: 72px;
        height: 72px;
        border-radius: var(--cp-radius-lg);
        margin-bottom: var(--cp-space-md);
      }

      .header h1 {
        font-size: var(--cp-text-2xl);
        font-weight: 700;
        margin-bottom: 4px;
      }

      .header p {
        color: var(--cp-text-secondary);
        font-size: var(--cp-text-sm);
      }

      /* ── Theme toggle ───────────────── */
      .theme-toggle {
        position: fixed;
        top: var(--cp-space-md);
        right: var(--cp-space-md);
        background: var(--cp-bg-surface);
        border: 1px solid var(--cp-border);
        border-radius: var(--cp-radius-full);
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 1.1rem;
        transition: background var(--cp-transition);
        z-index: 10;
        color: var(--cp-text);
      }

      .theme-toggle:hover {
        background: var(--cp-bg-elevated);
      }

      /* ── Stepper ────────────────────── */
      .stepper {
        display: flex;
        gap: 4px;
        margin-bottom: var(--cp-space-xl);
      }

      .stepper-segment {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
      }

      .stepper-bar {
        width: 100%;
        height: 4px;
        border-radius: 2px;
        background: var(--cp-border-subtle);
        transition: background 0.3s;
      }

      .stepper-bar.active {
        background: var(--cp-gradient);
      }

      .stepper-bar.done {
        background: var(--cp-success);
      }

      .stepper-label {
        font-size: var(--cp-text-xs);
        color: var(--cp-text-muted);
        transition: color var(--cp-transition);
      }

      .stepper-label.active {
        color: var(--cp-text);
        font-weight: 600;
      }

      /* ── Content ────────────────────── */
      .step-content {
        min-height: 200px;
      }

      /* ── Navigation ─────────────────── */
      .nav {
        display: flex;
        justify-content: space-between;
        margin-top: var(--cp-space-xl);
        padding-top: var(--cp-space-md);
        border-top: 1px solid var(--cp-border-subtle);
      }

      .nav .btn {
        min-width: 100px;
      }

      /* ── Error ──────────────────────── */
      .error-banner {
        background: var(--cp-error-bg);
        border: 1px solid var(--cp-error-border);
        border-radius: var(--cp-radius-md);
        padding: var(--cp-space-md);
        margin-bottom: var(--cp-space-lg);
        color: var(--cp-error);
        text-align: center;
      }

      /* ── Responsive ─────────────────── */
      @media (max-width: 480px) {
        .stepper-label {
          display: none;
        }

        .header-logo {
          width: 56px;
          height: 56px;
        }

        .header h1 {
          font-size: var(--cp-text-xl);
        }
      }
    `,
  ];

  @state() currentStep: StepName = 'auth';
  @state() authorized = false;
  @state() authError = '';
  @state() telegramTokenFromEnv = '';
  @state() authComplete = false;
  @state() ghUser = '';
  @state() isDocker = false;
  @state() theme: 'dark' | 'light' = 'dark';

  override connectedCallback() {
    super.connectedCallback();
    initApi();
    this.theme =
      (document.documentElement.getAttribute('data-theme') as
        | 'dark'
        | 'light') || 'dark';
    void this.checkAuth();
  }

  private async checkAuth() {
    try {
      const status = await api<{
        hasConfig: boolean;
        isDocker: boolean;
        env: {
          ghAuth: { available: boolean };
          telegramToken: { available: boolean };
          model: { available: boolean; value?: string };
        };
        persistence?: {
          enabled: boolean;
          repo: string;
          backupIntervalDays: number;
        };
      }>('/status');
      this.authorized = true;
      this.isDocker = status.isDocker;

      if (status.env.telegramToken.available) {
        this.telegramTokenFromEnv = '(from environment)';
      }

      if (status.persistence) {
        this._pendingPersistence = status.persistence;
      }
    } catch {
      this.authError = 'Invalid setup key. Check the URL.';
    }
  }

  private toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', this.theme);
    localStorage.setItem('cp-theme', this.theme);
  }

  private get currentIndex() {
    return STEPS.indexOf(this.currentStep);
  }

  // Called by auth-step when its completion state changes
  handleAuthChange(e: Event) {
    const authStep = e.target as AuthStep;
    this.authComplete = authStep.isComplete;
    if (authStep.ghUser) {
      this.ghUser = authStep.ghUser;
    }
  }

  private next() {
    const idx = this.currentIndex;
    if (idx < STEPS.length - 1) {
      // Capture current step's data before leaving it
      this.captureStepData(this.currentStep);
      this.currentStep = STEPS[idx + 1];
    }
  }

  private back() {
    const idx = this.currentIndex;
    if (idx > 0) {
      this.currentStep = STEPS[idx - 1];
    }
  }

  private captureStepData(step: StepName) {
    switch (step) {
      case 'channels': {
        const el = this.shadowRoot?.querySelector('channels-step') as
          | ChannelsStep
          | undefined;
        if (el) this._pendingChannels = el.channels;
        break;
      }

      case 'model': {
        const el = this.shadowRoot?.querySelector('model-step') as
          | ModelStep
          | undefined;
        if (el) this._pendingModel = el.model;
        break;
      }

      case 'skills': {
        const el = this.shadowRoot?.querySelector('skills-step') as
          | SkillsStep
          | undefined;
        if (el) this._pendingSkills = el.skills;
        break;
      }

      case 'backup': {
        const el = this.shadowRoot?.querySelector('persistence-step') as
          | PersistenceStep
          | undefined;
        if (el) {
          this._pendingPersistence = el.persistence;
          this._pendingRestore = el.restoreConfirmed === true;
        }
        break;
      }

      default:
        break;
    }
  }

  private _pendingModel = '';
  private _pendingSkills: string[] = [];
  private _pendingChannels: unknown[] = [];
  private _pendingPersistence: {
    enabled: boolean;
    repo: string;
    backupIntervalDays: number;
  } = { enabled: false, repo: '', backupIntervalDays: 1 };
  private _pendingRestore = false;

  private get canProceed() {
    if (this.currentStep === 'auth') {
      return this.authComplete;
    }

    return true;
  }

  override render() {
    if (this.authError) {
      return html`
        <div class="header">
          <img
            class="header-logo"
            src="${import.meta.env.BASE_URL}logo.png"
            alt=""
          />
          <h1 class="gradient-text">cawpilot setup</h1>
        </div>
        <div class="error-banner">${this.authError}</div>
      `;
    }

    if (!this.authorized) {
      return html`
        <div class="header">
          <img
            class="header-logo"
            src="${import.meta.env.BASE_URL}logo.png"
            alt=""
          />
          <h1 class="gradient-text">cawpilot Setup</h1>
          <p><span class="spinner"></span> Connecting...</p>
        </div>
      `;
    }

    return html`
      <button
        class="theme-toggle"
        @click=${this.toggleTheme}
        title="Toggle theme"
      >
        ${this.theme === 'dark' ? '☀️' : '🌙'}
      </button>

      <div class="header">
        <img
          class="header-logo"
          src="${import.meta.env.BASE_URL}logo.png"
          alt=""
        />
        <h1 class="gradient-text">cawpilot Setup</h1>
        <p>Configure your agent in a few steps.</p>
      </div>

      <div class="stepper">
        ${STEPS.map(
          (step, i) => html`
            <div class="stepper-segment">
              <div
                class="stepper-bar ${i < this.currentIndex
                  ? 'done'
                  : i === this.currentIndex
                    ? 'active'
                    : ''}"
              ></div>
              <span
                class="stepper-label ${i === this.currentIndex ? 'active' : ''}"
                >${STEP_LABELS[step]}</span
              >
            </div>
          `,
        )}
      </div>

      <div class="step-content">${this.renderStep()}</div>

      <div class="nav">
        <button
          class="btn"
          ?disabled=${this.currentIndex === 0}
          @click=${this.back}
        >
          ← Back
        </button>
        ${this.currentStep !== 'complete'
          ? html`
              <button
                class="btn btn-primary"
                ?disabled=${!this.canProceed}
                @click=${this.next}
              >
                Next →
              </button>
            `
          : ''}
      </div>
    `;
  }

  private renderStep() {
    switch (this.currentStep) {
      case 'auth':
        return html`<auth-step
          @auth-changed=${this.handleAuthChange}
        ></auth-step>`;
      case 'channels':
        return html`<channels-step
          .telegramToken=${this.telegramTokenFromEnv}
        ></channels-step>`;
      case 'model':
        return html`<model-step></model-step>`;
      case 'skills':
        return html`<skills-step></skills-step>`;
      case 'backup':
        return html`<persistence-step
          .ghUser=${this.ghUser}
          .initialPersistence=${this._pendingPersistence}
        ></persistence-step>`;
      case 'complete': {
        return html`<complete-step
          .model=${this._pendingModel}
          .skills=${this._pendingSkills}
          .channels=${this._pendingChannels}
          .persistence=${this._pendingPersistence}
          .restore=${this._pendingRestore}
        ></complete-step>`;
      }
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'setup-app': SetupApp;
  }
}
