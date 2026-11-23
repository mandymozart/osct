<script lang="ts">
  import type { ExperienceLanding, LandingShopItemData } from "@shared/types/landing";
  import { LANDING_SHOP_MAX } from "@shared/types/landing";
  import { appShopItems, canAddShopItem, shopPictureUrl, withLandingShop } from "#lib/landing-edit.js";
  import type { Point } from "#lib/context-menu.js";
  import ContextMenu, { type MenuItem } from "#lib/components/ContextMenu.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Section from "#lib/components/Section.svelte";

  /**
   * The landing's **shop** (#365): up to four items, each a picture, a label (one for every language) and a link. The
   * picture is a file of the Library (`onpickimage` opens it as a picker for that item) or the book's cover (the print
   * layout's front cover, as the app's book item). Nothing stored: the app's two items show greyed, and *Edit* copies
   * them into the list; an emptied list is no shop on the page. Values only (RULES #32): an edit goes to `onchange` with
   * the whole landing, which the workspace saves (RULES #37) and shows at once.
   */
  let { landing, assetsBase, cover = null, onchange, onpickimage, onfocus }: {
    landing: ExperienceLanding | null;
    /** The experience's assets base: a picture's content path is shown below it */
    assetsBase: string;
    /** The book's cover as the page shows it (null: none in the layout) */
    cover?: string | null;
    onchange: (next: ExperienceLanding) => void;
    /** Open the Library as the picker of an item's picture; the item gets the file's URL */
    onpickimage: (index: number, label: string) => void;
    /** The shop's heading is in focus (its place on the stage) */
    onfocus?: (key: "shop" | null) => void;
  } = $props();

  const shop = $derived(landing?.shop);
  const shown = $derived(shop ?? appShopItems());
  const summary = $derived(shop === undefined ? "the app's items" : shop.length ? `${shop.length} item${shop.length > 1 ? "s" : ""}` : "none – no shop");

  const setShop = (items: LandingShopItemData[] | undefined) => onchange(withLandingShop(landing, items));
  const setItem = (index: number, patch: Partial<LandingShopItemData>) => {
    const items = [...(shop ?? [])];
    const next: LandingShopItemData = { ...items[index], ...patch };
    if ("image" in patch) delete next.cover;
    if ("cover" in patch) delete next.image;
    for (const key of ["image", "cover"] as const) if (next[key] === undefined) delete next[key];
    items[index] = next;
    setShop(items);
  };
  const remove = (index: number) => setShop((shop ?? []).filter((_, i) => i !== index));
  const add = () => setShop([...(shop ?? []), { label: "", url: "" }]);

  let menu = $state<{ at: Point; index: number; button: HTMLElement } | null>(null);
  const pictureItems = (index: number): MenuItem[] => [
    { label: "Library…", icon: "folder", help: "Choose the item's picture among the experience's images.", select: () => onpickimage(index, shop?.[index]?.label || `item ${index + 1}`) },
    { label: "The book's cover", help: "The print layout's front cover – the book as it is printed.", select: () => setItem(index, { cover: true }) },
    { label: "No picture", disabled: !shop?.[index]?.image && !shop?.[index]?.cover ? "it has none" : false, select: () => setItem(index, { image: undefined, cover: undefined }) },
  ];
  const openMenu = (event: MouseEvent, index: number) => {
    const button = event.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();
    menu = { at: { x: rect.left, y: rect.bottom }, index, button };
  };
  const pictureOf = (item: LandingShopItemData): string | null =>
    item.cover ? cover ?? shopPictureUrl("/assets/ui/landing/book.svg", assetsBase) : item.image ? shopPictureUrl(item.image, assetsBase) : null;
</script>

<Section id="landing.shop" label="shop" open {summary}
  help="The landing page's shop: up to four items, each a picture (from the Library, or the book's cover), a label and a link. Nothing stored: the app's two items show – Edit makes them this experience's own. No items: the page has no shop.">
  {#snippet aside()}
    {#if shop !== undefined}
      <button type="button" class="pill" onclick={add} disabled={!canAddShopItem(shop)} data-help-name="Add a shop item"
        data-help="A new item at the end of the shop – fill in its label and link (up to {LANDING_SHOP_MAX} items).">+ item</button>
    {/if}
  {/snippet}
  <div class="items" class:placeholder={shop === undefined}>
    {#each shown as item, i (i)}
      <div class="item" data-shop-item={i}>
        {#if shop === undefined}
          <span class="thumb">{#if pictureOf(item)}<img src={pictureOf(item)} alt="" />{/if}</span>
          <span class="fields"><span class="field muted">{item.label}</span><span class="field muted small">{item.url}</span></span>
        {:else}
          <button type="button" class="thumb" aria-label="The picture of {item.label || `item ${i + 1}`}" title="Choose the picture"
            onclick={e => openMenu(e, i)} data-help-name="Shop picture" data-help="The item's picture: one of the experience's images (Library…), or the book's cover.">
            {#if pictureOf(item)}<img src={pictureOf(item)} alt="" />{/if}
          </button>
          <span class="fields">
            <input class="field" value={item.label} placeholder="label" aria-label="The label of shop item {i + 1}"
              oninput={e => setItem(i, { label: e.currentTarget.value })} data-help-name="Shop label" data-help="The item's name – the same in every language." />
            <input class="field small" value={item.url} placeholder="https://…" aria-label="The link of shop item {i + 1}" inputmode="url"
              oninput={e => setItem(i, { url: e.currentTarget.value.trim() })} data-help-name="Shop link" data-help="The page the item's Shop button opens (http or https)." />
          </span>
          <button type="button" class="icon-button" aria-label="Remove shop item {i + 1}" title="Remove the item" onclick={() => remove(i)}><Icon name="close" /></button>
        {/if}
      </div>
    {/each}
    {#if shop !== undefined && !shop.length}<p class="small muted">No items – the page has no shop.</p>{/if}
  </div>
  <div class="actions">
    {#if shop === undefined}
      <button type="button" class="text-link" onclick={() => setShop(appShopItems())} onfocus={() => onfocus?.("shop")} onblur={() => onfocus?.(null)}
        data-help-name="Edit the shop" data-help="Makes the app's two items this experience's own, to change, remove or add to.">Edit</button>
    {:else}
      <button type="button" class="text-link" onclick={() => setShop(undefined)} data-help-name="The app's shop"
        data-help="Removes this experience's own items: the page shows the app's two items again.">Use the app's items</button>
    {/if}
  </div>
  {#if menu}
    <ContextMenu at={menu.at} label="Shop picture" head="The item's picture" items={pictureItems(menu.index)} returnFocus={menu?.button} onclose={() => (menu = null)} />
  {/if}
</Section>

<style>
  .items { display: flex; flex-direction: column; gap: .375rem; }
  .item { display: grid; grid-template-columns: 2.5rem minmax(0, 1fr) auto; gap: .375rem; align-items: center; }
  .thumb { width: 2.5rem; height: 2.5rem; padding: 0; border: 1px solid var(--line); background: var(--surface); display: grid; place-items: center; overflow: hidden; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; }
  .fields { display: grid; gap: .125rem; min-width: 0; }
  .fields .field { width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .placeholder .item { grid-template-columns: 2.5rem minmax(0, 1fr); opacity: .6; }
  .actions { display: flex; gap: .75rem; margin-top: .25rem; }
</style>
