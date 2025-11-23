import { CollectionConfig } from 'payload'
import XLSX from 'xlsx'

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
      relationTo: 'excel-uploads',
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
            await req?.payload?.update({
              collection: 'import-buffer',
              id: doc.id,
              data: {
                importStatus: 'processing',
              },
            })

            // Fetch the file
            const file = await req.payload.findByID({
              collection: 'excel-uploads',
              id: doc.excelFile,
            })

            if (!file || !file.url) {
              throw new Error('File not found')
            }

            // Fetch and read the Excel file
            const response = await fetch(`${req.payload.config.serverURL}${file.url}`)
            const buffer = await response.arrayBuffer()
            const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
            const sheetName = workbook.SheetNames[0]
            const worksheet = workbook.Sheets[sheetName]
            const jsonData = XLSX.utils.sheet_to_json(worksheet)

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
              const expDate = new Date(row.expiration || '')
              const today = new Date()
              const sixMonthsLater = new Date()
              sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6)

              await req.payload.create({
                collection: 'clients',
                data: {
                  nom: row.nom || '',
                  prenom: row.prenom || '',
                  dateNaissance: row['date de naissance'] || '',
                  lieuNaissance: row['lieu de naissance'] || '',
                  numeroPasseport: row['numero passeport'] || '',
                  expiration: row.expiration || '',
                  paid: parseFloat(row.paid) || 0,
                  leftToPay: parseFloat(row['left to pay']) || 0,
                  expirationStatus: expDate > sixMonthsLater ? 'OK' : 'KO',
                  agentName: 'Hajj Mabrouk',
                },
              })
              importedCount++
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
            await req.payload.update({
              collection: 'import-buffer',
              id: doc.id,
              data: {
                importStatus: 'failed',
                importMessage: `✗ Import failed: ${errorMessage}`,
              },
            })
            console.error('Error processing import buffer:', error)
          }
        }
      },
    ],
  },
}
