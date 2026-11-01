<script lang="ts" generics="T extends string">
  /** A small enum as pressed pills (the dogma's Segmented): one of `options`, `value` is the pressed one */
  interface Props {
    options: readonly T[];
    value: T | null;
    labels?: Partial<Record<T, string>>;
    titles?: Partial<Record<T, string>>;
    /** The group's accessible name */
    label?: string;
    onchange: (value: T) => void;
  }
  let { options, value, labels = {}, titles = {}, label, onchange }: Props = $props();
</script>

<span class="seg" role="group" aria-label={label}>
  {#each options as option (option)}
    <button type="button" class="pill" class:on={option === value} aria-pressed={option === value} title={titles[option]} onclick={() => onchange(option)}>
      {labels[option] ?? option}
    </button>
  {/each}
</span>

<style>
  .seg { display: inline-flex; gap: .125rem; flex-wrap: wrap; }
</style>
