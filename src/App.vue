<template>
	<div class="min-h-screen bg-slate-950 text-slate-100">
		<div class="max-w-3xl mx-auto px-6 py-12">
			<!-- Header -->
			<header class="mb-10">
				<h1 class="text-4xl font-bold mb-2">Laravel Docs Q&A</h1>
				<p class="text-slate-400">
					Ask questions about Laravel — answers grounded in the official
					documentation.
				</p>
			</header>

			<!-- Input -->
			<div class="mb-8">
				<div class="flex gap-2">
					<input
                        ref="questionInput"
						v-model="question"
						type="text"
						placeholder="How do I define a route in Laravel?"
						class="flex-1 px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-slate-500 focus:ring-1 focus:ring-slate-500 disabled:opacity-50"
						:disabled="isLoading"
						@keydown.enter="askQuestion"
					/>
					<button
						@click="askQuestion"
						:disabled="isLoading || !question.trim()"
						class="px-6 py-3 bg-slate-100 text-slate-900 font-medium rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{{ isLoading ? '...' : 'Ask' }}
					</button>
				</div>
			</div>

			<!-- Error -->
			<div
				v-if="error"
				class="mb-6 px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-red-200"
			>
				{{ error }}
			</div>

			<!-- Answer -->
			<!-- Answer + New question button -->
			<div v-if="answer || isLoading" class="mb-8">
				<div class="flex items-center justify-between mb-3">
					<h2
						class="text-sm font-semibold text-slate-400 uppercase tracking-wider"
					>
						Answer
					</h2>
					<button
						v-if="!isLoading"
						@click="reset"
						class="text-sm text-slate-400 hover:text-slate-100 transition-colors"
					>
						New question
					</button>
				</div>
				<div class="prose prose-invert max-w-none">
					<p class="text-slate-200 leading-relaxed whitespace-pre-wrap">
						{{ answer
						}}<span v-if="isLoading" class="text-slate-500 animate-pulse"
							>▊</span
						>
					</p>
				</div>
			</div>

			<!-- Sources -->
			<div v-if="sources.length > 0" class="mb-8">
				<h2
					class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3"
				>
					Sources
				</h2>
				<ul class="space-y-2">
					<li v-for="(source, index) in sources" :key="index" class="text-sm">
						<a
							:href="source.url"
							target="_blank"
							rel="noopener noreferrer"
							class="text-slate-300 hover:text-slate-100 hover:underline"
						>
							<span class="text-slate-500">[{{ index + 1 }}]</span>
							{{ source.section || 'Laravel docs' }}
						</a>
					</li>
				</ul>
			</div>
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
				this.$nextTick(() => {
					(this.$refs.questionInput as HTMLInputElement)?.focus();
				});
			},
		},
	});
</script>
