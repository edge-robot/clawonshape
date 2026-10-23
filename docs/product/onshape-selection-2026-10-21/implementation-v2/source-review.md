# Numbered implementation excerpts

Base: `b34ad5d35cfac6c13c72ddce9bc1ac51efe24dbb`. File: `ui/control-ui.js`.
Full exact tracked-text delta: [review.patch](review.patch).

## Request and connection fences

```text
 269   const ticket = (region) => {
 270     const s = session,
 271       id = ++requests[region],
 272       e = epoch;
 273     return () => current(s) && requests[region] === id && epoch === e;
 274   };
 275   // Serialize only browsing reads per connection. Obsolete queued reads never reach the gateway.
 276   const browse = (action, extra, valid) => {
 277     const connection = session.connection;
 278     const result = (queues.get(connection) ?? Promise.resolve()).then(() =>
 279       valid() ? call(action, connection, extra) : undefined,
 280     );
 281     queues.set(
 282       connection,
 283       result.then(
 284         () => undefined,
 285         () => undefined,
 286       ),
 287     );
 288     return result;
 289   };
 290   const clearPreview = () => {
 291     requests.preview++;
 292     previewTarget = preview = previewError = undefined;
 293     previewLoading = false;
 294   };
 295   const clearParts = () => {
 296     requests.parts++;
 297     clearTimeout(partTimer);
```

## Real document browsing

```text
 408   const readDocuments = async (offset = 0, restore = false) => {
 409     const s = session,
 410       query = documentQuery.trim().normalize('NFC'),
 411       valid = ticket('documents');
 412     documentLoading = true;
 413     documentError = undefined;
 414     if (!offset) {
 415       documents = undefined;
 416     }
 417     draw();
 418     try {
 419       const result = await browse('work-context-documents', {query, offset}, valid);
 420       if (!valid()) {
 421         return;
 422       }
 423       if (!result?.ok) {
 424         throw new Error(errorCode(result));
 425       }
 426       const page = result.documents;
 427       if (
 428         page?.query !== query ||
 429         page.offset !== offset ||
 430         !Array.isArray(page.items) ||
 431         typeof page.hasMore !== 'boolean' ||
 432         (!offset && page.items[0]?.bound !== true)
 433       ) {
 434         throw new Error('provider_protocol_error');
 435       }
 436       const items = offset ? [...documents.items, ...page.items] : page.items;
```

## Pinned Part/studio preview

```text
 586   const readPreview = async (hit, studio, focusResult = false) => {
 587     if (!parts || !selectedDocument || !selectedWorkspace || (!hit && !studio)) {
 588       return;
 589     }
 590     clearPreview();
 591     const source = parts;
 592     const target = {
 593       documentId: source.documentId,
 594       workspaceId: source.workspaceId,
 595       elementId: studio?.elementId ?? hit.elementId,
 596       partId: studio ? null : hit.partId,
 597       observedMicroversion: source.observedMicroversion,
 598       name: studio ? studio.name : hit.name,
 599       studioName: studio ? studio.name : source.studios.find((item) => item.elementId === hit.elementId)?.name,
 600     };
 601     previewTarget = target;
 602     previewLoading = true;
 603     const valid = ticket('preview');
 604     draw();
 605     try {
 606       const {documentId, workspaceId, elementId, partId, observedMicroversion} = target;
 607       const result = await browse(
 608         'work-context-preview',
 609         {documentId, workspaceId, elementId, ...(partId === null ? {} : {partId}), observedMicroversion},
 610         valid,
 611       );
 612       if (!valid() || parts !== source || previewTarget !== target) {
 613         return;
 614       }
```

## Adoption readiness and payload

```text
 674   const adoptable = () =>
 675     selectedPart?.selectable === true &&
 676     parts &&
 677     !partLoading &&
 678     !previewLoading &&
 679     !workspaceLoading &&
 680     !documentLoading &&
 681     !documentError &&
 682     !workspaceError &&
 683     !partError &&
 684     known() &&
 685     view.validity !== 'unverified' &&
 686     !view.interlock.blocked &&
 687     canAdmin() &&
 688     !adopting;
 689   const adopt = async () => {
 690     if (!adoptable()) {
 691       return;
 692     }
 693     const s = session,
 694       source = parts,
 695       hit = selectedPart,
 696       requestEpoch = epoch;
 697     const payload = {
 698       expectedSelectionRevision: view.selectionRevision,
 699       documentId: source.documentId,
 700       workspaceId: source.workspaceId,
 701       elementId: hit.elementId,
 702       partId: hit.partId,
 703       observedMicroversion: source.observedMicroversion,
 704     };
 705     adopting = true;
 706     actionMessage = undefined;
 707     draw();
 708     try {
 709       const result = await call('work-context-adopt', s.connection, payload);
 710       if (!current(s) || epoch !== requestEpoch) {
 711         return;
 712       }
 713       if (result.ok && goodView(result.workContext)) {
 714         view = result.workContext;
 715         statusError = undefined;
 716         cardNotice = 'Arbeitskontext übernommen. Keine CAD-Arbeit gestartet.';
 717         close(false);
 718         render();
 719         returnFocus();
 720         return;
 721       }
```

## One bottom exit

```text
1204     const footer = el('footer', undefined, 'selector-footer');
1205     footer.append(el('p', 'Übernehmen setzt deinen Arbeitskontext. Es startet keine CAD-Arbeit.', 'muted'));
1206     const dismiss = keyed('Schließen', 'close-selection', () => close());
1207     dismiss.disabled = adopting;
1208     footer.append(dismiss);
1209     dialog.append(header, body, footer);
1210     body.scrollTop = bodyScroll;
1211     if (focusKey) {
1212       const next = [...dialog.querySelectorAll('[data-focus]')].find(
1213         (node) => node.getAttribute('data-focus') === focusKey,
1214       );
1215       if (next && !next.disabled && next.getClientRects().length) {
1216         next.focus({preventScroll: true});
1217         if (typeof caret === 'number' && next.tagName === 'INPUT') {
1218           next.setSelectionRange(caret, caret);
1219         }
1220       } else {
1221         [...dialog.querySelectorAll('[data-focus]')]
1222           .find((node) => !node.disabled && node.getClientRects().length)
1223           ?.focus({preventScroll: true});
1224       }
1225     }
1226   };
1227   const open = async (g, connection) => {
1228     if (!alive(g) || ref() !== connection || locked() || dialog) {
1229       return;
1230     }
1231     session = {g, connection};
1232     epoch++;
```

