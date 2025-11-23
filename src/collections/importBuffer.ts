import { CollectionConfig } from 'payload'
import XLSX from 'xlsx'
//import fetch from 'node-fetch'

interface ImportRow {
  nom?: string
  prenom?: string
  'date de naissance'?: string
  'lieu de naissance'?: string
  'numero passeport'?: string
  expiration?: string
  paid?: string | number
  'left to pay'?: string | number
}

interface ExcelFile {
  id: string
  url?: string
  filename?: string
}

export const importBuffer: CollectionConfig = {
  slug: 'import-buffer',
  admin: {
    useAsTitle: 'id',
    description:
      'Temporary collection for uploading Excel data. Upload your file and clients will be automatically populated.',
    defaultColumns: ['nom', 'prenom', 'numeroPasseport', 'expiration', 'paid', 'leftToPay'],
    hideAPIURL: true,
    group: 'Import',
  },
  fields: [
    {
      name: 'excelFile',
      type: 'upload',
      relationTo: 'excel-uploads' as const,
      required: true,
      label: 'Upload Excel File (.xlsx)',
      admin: {
        description:
          'Select your Excel file with columns: nom, prenom, date de naissance, lieu de naissance, numero passeport, expiration, paid, left to pay',
      },
    },
    {
      name: 'importStatus',
      type: 'select',
      options: [
        { label: 'Ready to Import', value: 'ready' },
        { label: 'Processing...', value: 'processing' },
        { label: 'Completed', value: 'completed' },
        { label: 'Failed', value: 'failed' },
      ],
      defaultValue: 'ready',
      admin: {
        readOnly: true,
      },
    },
    {
      name: 'importMessage',
      type: 'textarea',
      admin: {
        readOnly: true,
        description: 'Import result message',
      },
    },
  ],
  hooks: {
    afterChange: [
      async ({ doc, req, operation }) => {
        if (operation === 'create' && doc.excelFile) {
          try {
            // Update status to processing
            await req.payload.update({
              collection: 'import-buffer',
              id: doc.id,
              data: {
                importStatus: 'processing',
              },
            })

            // Fetch the file metadata
            const file = (await req.payload.findByID({
              collection: 'excel-uploads',
              id: typeof doc.excelFile === 'object' ? doc.excelFile.id : doc.excelFile,
            })) as ExcelFile

            if (!file || !file.url) {
              throw new Error('File not found or has no URL')
            }

            // Construct the full URL
            const serverURL = req.payload.config.serverURL || 'http://localhost:3000'
            const fileURL = `${serverURL}${file.url}`

            // Fetch and read the Excel file
            const response = await fetch(fileURL)
            if (!response.ok) {
              throw new Error(`Failed to fetch file: ${response.statusText}`)
            }

            const buffer = await response.arrayBuffer()
            const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
            const sheetName = workbook.SheetNames[0]

            if (!sheetName) {
              throw new Error('No sheets found in Excel file')
            }

            const worksheet = workbook.Sheets[sheetName]
            const jsonData = XLSX.utils.sheet_to_json<ImportRow>(worksheet)

            if (!jsonData || jsonData.length === 0) {
              throw new Error('Excel file is empty')
            }

            // Clear existing clients
            const existingClients = await req.payload.find({
              collection: 'clients',
              limit: 9999,
            })

            for (const client of existingClients.docs) {
              await req.payload.delete({
                collection: 'clients',
                id: client.id,
              })
            }

            // Import each row
            let importedCount = 0
            for (const row of jsonData) {
              try {
                const expirationStr = row.expiration || ''
                const expDate = new Date(expirationStr)
                const today = new Date()
                const sixMonthsLater = new Date()
                sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6)

                const status = expDate > sixMonthsLater ? 'OK' : 'KO'

                await req.payload.create({
                  collection: 'clients',
                  data: {
                    nom: row.nom || '',
                    prenom: row.prenom || '',
                    dateNaissance: row['date de naissance'] || '',
                    lieuNaissance: row['lieu de naissance'] || '',
                    numeroPasseport: row['numero passeport'] || '',
                    expiration: row.expiration || '',
                    paid: typeof row.paid === 'string' ? parseFloat(row.paid) : row.paid || 0,
                    leftToPay:
                      typeof row['left to pay'] === 'string'
                        ? parseFloat(row['left to pay'])
                        : row['left to pay'] || 0,
                    expirationStatus: status,
                    agentName: 'Hajj Mabrouk',
                  },
                })
                importedCount += 1
              } catch (rowError) {
                console.error(`Error importing row:`, rowError)
                // Continue with next row
              }
            }

            // Update status to completed
            await req.payload.update({
              collection: 'import-buffer',
              id: doc.id,
              data: {
                importStatus: 'completed',
                importMessage: `✓ Successfully imported ${importedCount} clients to the Clients collection`,
              },
            })

            console.log(`✓ Successfully imported ${importedCount} clients`)
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Import failed'
            try {
              await req.payload.update({
                collection: 'import-buffer',
                id: doc.id,
                data: {
                  importStatus: 'failed',
                  importMessage: `✗ Import failed: ${errorMessage}`,
                },
              })
            } catch (updateError) {
              console.error('Error updating import status:', updateError)
            }
            console.error('Error processing import buffer:', error)
          }
        }
      },
    ],
  },
}
