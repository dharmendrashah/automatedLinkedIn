import {
   columnVisibilityFeature,
   createPaginatedRowModel,
   rowPaginationFeature,
   rowSelectionFeature,
   tableFeatures,
} from '@tanstack/react-table'

// The features every tab of the dashboard table uses; anything not registered is left out of the bundle.
export const features = tableFeatures({
   columnVisibilityFeature,
   rowPaginationFeature,
   rowSelectionFeature,
   paginatedRowModel: createPaginatedRowModel(),
})
