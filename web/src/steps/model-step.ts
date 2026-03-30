import { LitElement, html, css } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { sharedStyles } from '../lib/styles.js';
import { api } from '../lib/api.js';

@customElement('model-step')
export class ModelStep extends LitElement {
  static override styles = [
    sharedStyles,
    css`
      .model-info {
        font-size: var(--cp-text-xs);
        color: var(--cp-text-secondary);
        margin-top: var(--cp-space-sm);
      }
    `,
  ];

  @property({ type: String }) defaultOrchestratorModel = '';
  @property({ type: String }) defaultTaskModel = '';

  @state() models: Array<{ id: string; name: string }> = [];
  @state() selectedOrchestratorModel = '';
  @state() selectedTaskModel = '';
  @state() loading = true;
  @state() error = '';

  override connectedCallback() {
    super.connectedCallback();
    void this.loadModels();
  }

  private async loadModels() {
    this.loading = true;
    this.error = '';
    try {
      const result = await api<{
        models: Array<{ id: string; name: string }>;
      }>('/models');
      this.models = result.models;

      const defaultId =
        this.models.find((m) => m.id === 'gpt-4.1')?.id ||
        this.models[0]?.id ||
        '';

      this.selectedOrchestratorModel =
        this.defaultOrchestratorModel || defaultId;
      this.selectedTaskModel =
        this.defaultTaskModel || defaultId;
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load models';
    }

    this.loading = false;
  }

  get orchestratorModel() {
    return this.selectedOrchestratorModel;
  }

  get taskModel() {
    return this.selectedTaskModel;
  }

  override render() {
    if (this.loading) {
      return html`
        <div class="step-header">Models</div>
        <div class="step-desc">
          <span class="spinner"></span> Loading available models...
        </div>
      `;
    }

    if (this.error) {
      return html`
        <div class="step-header">Models</div>
        <div class="step-desc status-error">${this.error}</div>
        <button class="btn" @click=${this.loadModels}>Retry</button>
      `;
    }

    return html`
      <div class="step-header">Models</div>
      <div class="step-desc">
        Select the AI models your agent will use.
      </div>

      <div class="field">
        <label>Orchestration model (task routing)</label>
        <select
          .value=${this.selectedOrchestratorModel}
          @change=${(e: Event) => {
            this.selectedOrchestratorModel = (e.target as HTMLSelectElement).value;
          }}
        >
          ${this.models.map(
            (m) =>
              html`<option value=${m.id} ?selected=${m.id === this.selectedOrchestratorModel}>
                ${m.name} (${m.id})
              </option>`,
          )}
        </select>
      </div>

      <div class="field">
        <label>Task model (running tasks)</label>
        <select
          .value=${this.selectedTaskModel}
          @change=${(e: Event) => {
            this.selectedTaskModel = (e.target as HTMLSelectElement).value;
          }}
        >
          ${this.models.map(
            (m) =>
              html`<option value=${m.id} ?selected=${m.id === this.selectedTaskModel}>
                ${m.name} (${m.id})
              </option>`,
          )}
        </select>
      </div>

      <div class="model-info">
        You can change these later in the config file.
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'model-step': ModelStep;
  }
}
