# Fix build: wrapperClassName no LazyImage

O erro em `DMsView.tsx:999` ocorre se o `LazyImage.tsx` no repo **não** declara `wrapperClassName`.

## Opção A (recomendada)
Substitua **todo** o arquivo `src/components/gdf/LazyImage.tsx` pelo da pasta deste zip.

Confirme no GitHub que o arquivo contém:

```ts
wrapperClassName?: string;
```

## Opção B (workaround rápido)
Em `src/components/gdf/DMsView.tsx`, apague a linha:

```tsx
wrapperClassName="max-w-full block"
```

Ou rode:

```bash
bash scripts/fix-dms-lazyimage.sh
```
