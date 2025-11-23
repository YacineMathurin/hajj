import { CollectionConfig } from 'payload'

export const excelUploads: CollectionConfig = {
  slug: 'excel-uploads',
  admin: {
    hidden: true,
  },
  upload: {
    staticDir: 'media',
    mimeTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
    },
  ],
}
