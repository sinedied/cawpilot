import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from './lib/styles.js';
import { initApi, api } from './lib/api.js';
import type { AuthStep } from './steps/auth-step.js';
import type { ChannelsStep } from './steps/channels-step.js';
import type { ModelStep } from './steps/model-step.js';
import type { SkillsStep } from './steps/skills-step.js';

const STEPS = ['auth', 'channels', 'model', 'skills', 'complete'] as const;
type StepName = (typeof STEPS)[number];

@customElement('setup-app')
export class SetupApp extends LitElement {
  static override styles = [
    sharedStyles,
    css`
      :host {
        max-width: 560px;
        width: 100%;
      }

      .header {
        text-align: center;
        margin-bottom: 2rem;
      }

      .header h1 {
        font-size: 1.75rem;
        font-weight: 700;
        margin-bottom: 0.25rem;
      }

      .header p {
        color: #8b949e;
        font-size: 0.9rem;
      }

      .stepper {
        display: flex;
        gap: 0.25rem;
        margin-bottom: 2rem;
      }

      .stepper-dot {
        flex: 1;
        height: 4px;
        border-radius: 2px;
        background: #21262d;
        transition: background 0.3s;
      }

      .stepper-dot.active {
        background: #58a6ff;
      }

      .stepper-dot.done {
        background: #238636;
      }

      .step-content {
        min-height: 200px;
      }

      .nav {
        display: flex;
        justify-content: space-between;
        margin-top: 2rem;
        padding-top: 1rem;
        border-top: 1px solid #21262d;
      }

      .error-banner {
        background: #3d1519;
        border: 1px solid #f85149;
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1.5rem;
        color: #f85149;
        text-align: center;
      }
    `,
  ];

  @state() currentStep: StepName = 'auth';
  @state() authorized = false;
  @state() authError = '';
  @state() telegramTokenFromEnv = '';

  override connectedCallback() {
    super.connectedCallback();
    initApi();
    void this.checkAuth();
  }

  private async checkAuth() {
    try {
      const status = await api<{
        hasConfig: boolean;
        env: {
          ghAuth: { available: boolean };
          telegramToken: { available: boolean };
          model: { available: boolean; value?: string };
        };
      }>('/status');
      this.authorized = true;

      if (status.env.telegramToken.available) {
        this.telegramTokenFromEnv = '(from environment)';
      }
    } catch {
      this.authError = 'Invalid setup key. Check the URL.';
    }
  }

  private get currentIndex() {
    return STEPS.indexOf(this.currentStep);
  }

  private next() {
    const idx = this.currentIndex;
    if (idx < STEPS.length - 1) {
      // On the "complete" step, gather data from previous steps
      if (STEPS[idx + 1] === 'complete') {
        this.prepareComplete();
      }

      this.currentStep = STEPS[idx + 1];
    }
  }

  private back() {
    const idx = this.currentIndex;
    if (idx > 0) {
      this.currentStep = STEPS[idx - 1];
    }
  }

  private prepareComplete() {
    const modelStep = this.shadowRoot?.querySelector('model-step') as
      | ModelStep
      | undefined;
    const skillsStep = this.shadowRoot?.querySelector('skills-step') as
      | SkillsStep
      | undefined;
    const channelsStep = this.shadowRoot?.querySelector('channels-step') as
      | ChannelsStep
      | undefined;

    // Data will be read from steps when complete-step saves
    // Store references for the complete step
    this._pendingModel = modelStep?.model ?? 'gpt-4.1';
    this._pendingSkills = skillsStep?.skills ?? [];
    this._pendingChannels = channelsStep?.channels ?? [];
  }

  private _pendingModel = '';
  private _pendingSkills: string[] = [];
  private _pendingChannels: unknown[] = [];

  private get canProceed() {
    if (this.currentStep === 'auth') {
      const authStep = this.shadowRoot?.querySelector('auth-step') as
        | AuthStep
        | undefined;
      return authStep?.isComplete ?? false;
    }

    return true;
  }

  override render() {
    if (this.authError) {
      return html`
        <div class="header">
          <h1>CawPilot Setup</h1>
        </div>
        <div class="error-banner">${this.authError}</div>
      `;
    }

    if (!this.authorized) {
      return html`
        <div class="header">
          <h1>CawPilot Setup</h1>
          <p><span class="spinner"></span> Connecting...</p>
        </div>
      `;
    }

    return html`
      <div class="header">
        <h1>CawPilot Setup</h1>
        <p>Configure your agent in a few steps.</p>
      </div>

      <div class="stepper">
        ${STEPS.map(
          (step, i) => html`
            <div
              class="stepper-dot ${i < this.currentIndex
                ? 'done'
                : i === this.currentIndex
                  ? 'active'
                  : ''}"
            ></div>
          `,
        )}
      </div>

      <div class="step-content">${this.renderStep()}</div>

      ${this.currentStep !== 'complete'
        ? html`
            <div class="nav">
              <button
                class="btn"
                ?disabled=${this.currentIndex === 0}
                @click=${this.back}
              >
                ← Back
              </button>
              <button
                class="btn btn-primary"
                ?disabled=${!this.canProceed}
                @click=${this.next}
              >
                Next →
              </button>
            </div>
          `
        : ''}
    `;
  }

  private renderStep() {
    switch (this.currentStep) {
      case 'auth':
        return html`<auth-step></auth-step>`;
      case 'channels':
        return html`<channels-step
          .telegramToken=${this.telegramTokenFromEnv}
        ></channels-step>`;
      case 'model':
        return html`<model-step></model-step>`;
      case 'skills':
        return html`<skills-step></skills-step>`;
      case 'complete': {
        return html`<complete-step
          .model=${this._pendingModel}
          .skills=${this._pendingSkills}
          .channels=${this._pendingChannels}
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
