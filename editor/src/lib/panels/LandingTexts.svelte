<script lang="ts">
  import type { ExperienceLanding, LandingTextKey } from "@shared/types/landing";
  import type { LandingLanguage } from "@ui/landing/texts";
  import { appTextOf, LANDING_EDIT_LANGUAGES, LANDING_TEXT_FIELDS, withLandingText } from "#lib/landing-edit.js";
  import Section from "#lib/components/Section.svelte";
  import Segmented from "#lib/components/Segmented.svelte";

  /**
   * The landing's **texts** (#365): the intro, *Get the app*, the line beside the QR code and the shop's heading, per
   * language – the switch over the fields is the reader's languages, and the stage shows the page in the one chosen. A
   * blank field shows the app's text in that language (greyed) and the page uses it. Values only (RULES #32): an edit
   * goes to `onchange` with the whole landing, which the workspace saves (RULES #37) and shows at once. The field in
   * focus goes to `onfocus` – the stage marks its place.
   */
  let { landing, language = $bindable("en"), title, author, onchange, onfocus }: {
    /** The landing as the workspace holds it */
    landing: ExperienceLanding | null;
    /** The language the fields and the stage show */
    language?: LandingLanguage;
    /** The experience's title and its book's author – the app's texts are shown with them */
    title: string;
    author: string;
    onchange: (next: ExperienceLanding) => void;
    onfocus?: (key: LandingTextKey | null) => void;
  } = $props();

  const own = $derived(landing?.texts?.[language] ?? {});
  const summary = $derived.by(() => {
    const languages = Object.keys(landing?.texts ?? {});
    return languages.length ? `own in ${languages.map(code => code.toUpperCase()).join(", ")}` : "the app's";
  });
  const LABELS = Object.fromEntries(LANDING_EDIT_LANGUAGES.map(code => [code, code.toUpperCase()]));
  const TITLES = { en: "English", de: "German", fr: "French", nl: "Dutch" };
</script>

<Section id="landing.texts" label="texts" open {summary}
  help="The landing page's own texts, per language: the intro, Get the app, the line beside the QR code and the shop's heading. A field left empty shows the app's text in that language – greyed here – and the page uses it. The QR code's description, Scan with your phone and Privacy & terms stay the app's.">
  <div class="row" data-help-name="Language" data-help="The language the fields and the stage show – the reader shows the visitor's.">
    <span class="label">language</span>
    <Segmented options={LANDING_EDIT_LANGUAGES} value={language} labels={LABELS} titles={TITLES} label="The texts' language" onchange={code => (language = code)} />
  </div>
  {#each LANDING_TEXT_FIELDS as field (field.key)}
    <div class="row" data-help-name="Landing {field.label}" data-help={field.help}>
      <span class="label">{field.label}</span>
      {#if field.multiline}
        <textarea class="field area" rows="4" aria-label="The landing's {field.label} ({language})" value={own[field.key] ?? ""}
          placeholder={appTextOf(language, field.key, { title, author })} data-landing-text={field.key}
          oninput={e => onchange(withLandingText(landing, language, field.key, e.currentTarget.value))}
          onfocus={() => onfocus?.(field.key)} onblur={() => onfocus?.(null)}></textarea>
      {:else}
        <input class="field" aria-label="The landing's {field.label} ({language})" value={own[field.key] ?? ""}
          placeholder={appTextOf(language, field.key, { title, author })} data-landing-text={field.key}
          oninput={e => onchange(withLandingText(landing, language, field.key, e.currentTarget.value))}
          onfocus={() => onfocus?.(field.key)} onblur={() => onfocus?.(null)} />
      {/if}
    </div>
  {/each}
</Section>

<style>
  .row > .field { width: 100%; min-width: 0; }
  textarea.area { height: auto; min-height: 5rem; padding: .375rem .5rem; resize: vertical; line-height: 1.4; }
  .field::placeholder { color: var(--muted); font-style: italic; }
</style>
