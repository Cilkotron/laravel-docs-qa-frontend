<template>
  <div class="min-h-screen bg-slate-950 text-slate-100 font-mono">
    <div class="max-w-3xl mx-auto px-6 py-16">
      
      <!-- Header -->
      <header class="mb-12">
        <h1 class="text-3xl font-bold tracking-tight mb-2">
          laravel-docs-qa
        </h1>
        <p class="text-sm text-slate-400">
          Ask questions about Laravel — answers grounded in the official documentation.
        </p>
      </header>
      
      <!-- Input -->
      <div class="mb-10">
        <div class="flex gap-2">
          <input
            v-model="question"
            type="text"
            placeholder="How do I define a route in Laravel?"
            class="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-md
                   text-slate-100 placeholder-slate-500 text-sm
                   focus:outline-none focus:border-slate-300 focus:ring-1 focus:ring-slate-300
                   disabled:opacity-50 transition-colors"
            :disabled="isLoading"
            @keydown.enter="askQuestion"
          />
          <button
            @click="askQuestion"
            :disabled="isLoading || !question.trim()"
            class="px-5 py-3 bg-slate-100 text-slate-900 text-sm font-medium rounded-md
                   hover:bg-white transition-colors
                   disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {{ isLoading ? '...' : 'ask' }}
          </button>
        </div>
      </div>
      
      <!-- Error -->
      <div
        v-if="error"
        class="mb-6 px-4 py-3 bg-red-950 border border-red-900 rounded-md text-red-200 text-sm"
      >
        {{ error }}
      </div>
      
      <!-- Answer -->
      <div v-if="answer || isLoading" class="mb-10">
        <div class="flex items-center justify-between mb-4 pb-2 border-b border-slate-800">
          <h2 class="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            // answer
          </h2>
          <button
            v-if="!isLoading"
            @click="reset"
            class="text-xs text-slate-400 hover:text-slate-100 transition-colors"
          >
            new question →
          </button>
        </div>
        <div>
            <p class="text-sm text-slate-200 leading-relaxed whitespace-pre-line" 
                v-html="parsedAnswer">
            </p>
            <span v-if="isLoading" class="text-slate-500 animate-pulse">▊</span>
        </div>
      </div>
      
      <!-- Sources -->
      <div v-if="sources.length > 0" class="mb-10">
        <h2 class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 pb-2 border-b border-slate-800">
          // sources
        </h2>
        <ul class="space-y-2">
          <li
            v-for="(source, index) in sources"
            :key="index"
            class="text-sm"
          >
            <a
              :href="source.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-slate-300 hover:text-slate-100 hover:underline inline-flex items-baseline gap-2"
            >
              <span class="text-slate-500">[{{ index + 1 }}]</span>
              <span>{{ source.section || 'Laravel docs' }}</span>
            </a>
          </li>
        </ul>
      </div>
      
      <!-- Footer -->
      <footer class="mt-16 pt-6 border-t border-slate-800">
        <p class="text-xs text-slate-500">
          Built on Cloudflare Workers AI + Vectorize. 
          <a href="https://github.com/Cilkotron/laravel-docs-qa-worker" target="_blank" class="hover:text-slate-100 underline">source</a>
        </p>
      </footer>
      
    </div>
  </div>
</template>
<script lang="ts">
	import { defineComponent } from 'vue';

	interface Source {
		url: string;
		section: string;
		score: number;
	}

	interface Data {
		question: string;
		answer: string;
		sources: Source[];
		isLoading: boolean;
		error: string | null;
        copiedIndex: number | null;
        copyTrigger: number;
        codeBlocks: Record<number, string>;
	}

    declare global {
        interface Window {
            copyCode: (index: number) => void;
        }
    }

	export default defineComponent({
		name: 'App',
		data(): Data {
			return {
				question: '',
				answer: '',
				sources: [],
				isLoading: false,
				error: null,
                copiedIndex: null,
                copyTrigger: 0, 
                codeBlocks: {}, 
			};
		},
		methods: {
			async askQuestion() {
				const q = this.question.trim();
				if (!q || this.isLoading) return;

				// Reset state
				this.answer = '';
				this.sources = [];
				this.error = null;
				this.isLoading = true;

				try {
					const response = await fetch('/api/ask', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ question: q }),
					});

					// Parse sources from header before reading body
					const sourcesHeader = response.headers.get('X-Sources');
					if (sourcesHeader) {
						try {
							this.sources = JSON.parse(sourcesHeader);
						} catch {
							// Header malformed, ignore
						}
					}

					if (!response.ok) {
						const errBody = await response.text();
						try {
							const errJson = JSON.parse(errBody);
							this.error =
								errJson.message || errJson.error || `Error ${response.status}`;
						} catch {
							this.error = `Error ${response.status}: ${errBody.slice(0, 200)}`;
						}
						return;
					}

					if (!response.body) {
						this.error = 'No response body';
						return;
					}

					// Stream reading
					const reader = response.body.getReader();
					const decoder = new TextDecoder();
					let buffer = '';

					while (true) {
						const { done, value } = await reader.read();
						if (done) break;

						buffer += decoder.decode(value, { stream: true });

						const lines = buffer.split('\n');
						buffer = lines.pop() || '';

						for (const line of lines) {
							if (!line.startsWith('data: ')) continue;
							const data = line.slice(6).trim();

							if (data === '[DONE]') return;

							try {
								const parsed = JSON.parse(data);
								if (parsed.response) {
									this.answer += parsed.response;
								}
							} catch {
								// Skip malformed JSON chunks
							}
						}
					}
				} catch (e) {
					this.error = e instanceof Error ? e.message : 'Unknown error';
				} finally {
					this.isLoading = false;
				}
			},
			reset() {
				this.question = '';
				this.answer = '';
				this.sources = [];
				this.error = null;
				// this.$nextTick(() => {
				// 	(this.$refs.questionInput as HTMLInputElement)?.focus();
				// });
			},
		},
       computed: {
            parsedAnswer() {
                this.copyTrigger;
                return this.answer.replace(
                    /```(\w+)?\n?([\s\S]*?)```/g,
                    (_match, _lang, code, offset) => `
                        <div class="relative bg-slate-800 rounded-md">
                            <button 
                                onclick="copyCode(${offset})"
                                class="absolute right-2 top-2 text-xs text-slate-400 hover:text-white cursor-pointer"
                            >
                                ${this.copiedIndex === offset ? 'Copied ✓' : 'Copy'}
                            </button>
                            <pre class="px-4 text-sm overflow-x-auto"><code>${code.trim()}</code></pre>
                        </div>
                    `
                );
            }
        },
        beforeUnmount() {
            window.copyCode;
        },
        mounted() {
            window.copyCode = (index: number) => {
                navigator.clipboard.writeText(this.codeBlocks[index]);
                this.copiedIndex = index;
                this.copyTrigger++;
                setTimeout(() => {
                    this.copiedIndex = null;
                    this.copyTrigger++;
                }, 2000);
            }
        },
         watch: {
            answer() {
                this.answer.replace(
                    /```(\w+)?\n?([\s\S]*?)```/g,
                    (_match, _lang, code, offset) => {
                        this.codeBlocks[offset] = code.trim();
                        return '';
                    }
                );
            }
        },
	});
</script>
