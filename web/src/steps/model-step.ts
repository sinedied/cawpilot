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
        font-size: 0.8rem;
        color: #8b949e;
        margin-top: 0.5rem;
      }
    `,
  ];

  @property({ type: String }) defaultModel = '';

  @state() models: Array<{ id: string; name: string }> = [];
  @state() selectedModel = '';
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
      this.selectedModel =
        this.defaultModel ||
        this.models.find((m) => m.id === 'gpt-4.1')?.id ||
        this.models[0]?.id ||
        '';
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load models';
    }

    this.loading = false;
  }

  get model() {
    return this.selectedModel;
  }

  override render() {
    if (this.loading) {
      return html`
        <div class="step-header">Model</div>
        <div class="step-desc">
          <span class="spinner"></span> Loading available models...
        </div>
      `;
    }

    if (this.error) {
      return html`
        <div class="step-header">Model</div>
        <div class="step-desc status-error">${this.error}</div>
        <button class="btn" @click=${this.loadModels}>Retry</button>
      `;
    }

    return html`
      <div class="step-header">Model</div>
      <div class="step-desc">
        Select the AI model your agent will use.
      </div>

      <div class="field">
        <label>Model</label>
        <select
          .value=${this.selectedModel}
          @change=${(e: Event) => {
            this.selectedModel = (e.target as HTMLSelectElement).value;
          }}
        >
          ${this.models.map(
            (m) =>
              html`<option value=${m.id} ?selected=${m.id === this.selectedModel}>
                ${m.name} (${m.id})
              </option>`,
          )}
        </select>
      </div>

      <div class="model-info">
        You can change this later in the config file.
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'model-step': ModelStep;
  }
}
