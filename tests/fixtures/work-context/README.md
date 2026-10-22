Recorded-shape Onshape REST responses for the work-context tests (work-context.md §2 R1–R5). Synthetic IDs only;
the field set follows the Onshape OpenAPI schemas (`BTPartMetadataInfo`, `BTConfigurationResponse-2019`,
`BTDocumentElementInfo`). Not live recordings: WC1–WC3 are confirmed in the live E2E.

Browsing (work-context.md §11, R6–R8): `documents-search.json` (getDocuments page with a folder item, a trashed
document, an invalid label and owner/permission fields that must never reach a view), `workspaces-browse.json`
(getDocumentWorkspaces with a non-Primary workspace) and `parts-fasteners.json` (R4 of a non-bound Part Studio with
part numbers). Same rules: synthetic IDs, OpenAPI field set (`BTGlobalTreeNodeListResponse`, `BTWorkspaceInfo`).
