import path from 'path'
import fs from 'fs'
import { CollectionConfig } from 'payload'
import * as XLSX from 'xlsx'

interface ImportRow {
  nom?: string
  prenom?: string
  dateNaissance?: string
  lieuNaissance?: string
  numeroPasseport: string
  expiration?: string
  paid?: string | number
  leftToPay?: string | number
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
    defaultColumns: ['id', 'importStatus', 'importMessage'], // Added 'id' and relevant status fields
    // hideAPIURL: true, // Removed, often unnecessary and can complicate debugging
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
        readOnly: true, // Keep readOnly, status is set by hooks
      },
    },
    {
      name: 'importMessage',
      type: 'textarea',
      admin: {
        readOnly: true, // Keep readOnly, message is set by hooks
        description: 'Import result message',
      },
    },
  ],
  hooks: {
    beforeChange: [
      async ({ data, req, operation }) => {
        if (operation === 'create' && data.excelFile) {
          data.importStatus = 'processing'
          data.importMessage = 'Processing file...'
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, req, operation }) => {
        if (operation === 'create' && doc.excelFile) {
          // Run import in background without awaiting
          setImmediate(async () => {
            // 🔑 Create a simple request object for internal updates
            const internalReq = { user: req.user, payload: req.payload } as any

            try {
              // Fetch the file metadata
              const file = (await req.payload.findByID({
                collection: 'excel-uploads',
                id: typeof doc.excelFile === 'object' ? doc.excelFile.id : doc.excelFile, // Using internalReq here can be safer, though req might work for findByID
                req: internalReq,
              })) as ExcelFile

              if (!file || !file.url) {
                throw new Error('File not found or has no URL')
              } // Read file directly from disk

              let filePath: string // Check if file has a filename property (newer Payload versions)
              // NOTE: This assumes the 'media' directory is correct. Check your S3/local setup if this fails.

              if (file.filename) {
                filePath = path.join(process.cwd(), 'media', file.filename)
              } else if (file.url) {
                // Fallback: extract filename from URL
                const filename = file.url.split('/').pop()
                if (!filename) {
                  throw new Error('Could not determine filename from URL')
                }
                filePath = path.join(process.cwd(), 'media', filename)
              } else {
                throw new Error('File has no filename or URL')
              } // Verify file exists

              if (!fs.existsSync(filePath)) {
                throw new Error(`File not found at path: ${filePath}`)
              } // Read file from disk

              const buffer = fs.readFileSync(filePath)
              const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
              const sheetName = workbook.SheetNames[0]

              if (!sheetName) {
                throw new Error('No sheets found in Excel file')
              }

              const worksheet = workbook.Sheets[sheetName] // Use header: 1 to get array of arrays, then determine headers,
              // or rely on the default behavior if headers match ImportRow keys.
              const jsonData = XLSX.utils.sheet_to_json<ImportRow>(worksheet)

              if (!jsonData || jsonData.length === 0) {
                throw new Error('Excel file is empty')
              } // Use the internalReq for admin-level operations

              // --- Client Clearing ---
              const existingClients = await internalReq.payload.find({
                collection: 'clients',
                limit: 9999,
                req: internalReq, // Added req for context
              })

              for (const client of existingClients.docs) {
                await internalReq.payload.delete({
                  collection: 'clients',
                  id: client.id,
                  req: internalReq, // Added req for context
                })
              } // Import each row
              // --- End Client Clearing ---

              let importedCount = 0

              for (const row of jsonData) {
                try {
                  // Passport Expiration Logic
                  const expirationStr = row.expiration || '' // XLSX.utils.sheet_to_json can return Excel date serial numbers.
                  // Check if expirationStr is a number and convert it if necessary.
                  let dateValue: Date
                  if (typeof expirationStr === 'number') {
                    // Excel date serial number (44275.0 for 2021-03-20). Convert to Date.
                    // 1 is subtracted because XLSX.js date conversion starts from 1900-01-01
                    // The conversion can be tricky, using a helper function is best practice.
                    // For simplicity, we'll assume a standard utility or string for now, but be warned.
                    dateValue = XLSX.SSF.parse_date_code(expirationStr)
                  } else {
                    dateValue = new Date(expirationStr)
                  } // This logic uses the raw date value from the row, which might be a string or number
                  // depending on the XLSX.utils.sheet_to_json options.
                  const expDate = new Date(row.expiration || '') // Relying on Date parsing
                  const sixMonthsLater = new Date()
                  sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6) // Set time to start of day to ensure correct comparison against date-only values
                  sixMonthsLater.setHours(0, 0, 0, 0)

                  const status = expDate > sixMonthsLater ? 'OK' : 'KO'

                  await internalReq.payload.create({
                    collection: 'clients',
                    req: internalReq, // Added req for context
                    data: {
                      nom: row.nom || '',
                      prenom: row.prenom || '',
                      dateNaissance: row.dateNaissance || '',
                      lieuNaissance: row.lieuNaissance || '',
                      numeroPasseport: row.numeroPasseport || '',
                      expiration: row.expiration || '',
                      paid: typeof row.paid === 'string' ? parseFloat(row.paid) : row.paid || 0,
                      leftToPay:
                        typeof row.leftToPay === 'string'
                          ? parseFloat(row.leftToPay)
                          : row.leftToPay || 0,
                      expirationStatus: status,
                      agentName: 'Hajj Mabrouk',
                    },
                  })
                  importedCount += 1
                } catch (rowError) {
                  console.error(`Error importing row:`, rowError) // Continue with next row
                }
              } // Update status to completed

              await internalReq.payload.update({
                // 🔑 Used internalReq
                collection: 'import-buffer',
                id: doc.id,
                req: internalReq, // 🔑 Used internalReq
                data: {
                  importStatus: 'completed',
                  importMessage: `✓ Successfully imported ${importedCount} clients to the Clients collection`,
                },
              })

              console.log(`✓ Successfully imported ${importedCount} clients`)
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Import failed'
              console.error('Error processing import buffer:', error)
              try {
                await internalReq.payload.update({
                  // 🔑 Used internalReq
                  collection: 'import-buffer',
                  id: doc.id,
                  req: internalReq, // 🔑 Used internalReq
                  data: {
                    importStatus: 'failed',
                    importMessage: `✗ Import failed: ${errorMessage}`,
                  },
                })
              } catch (updateError) {
                console.error('Error updating import status after failure:', updateError)
              }
            }
          })
        } // NOTE: You should still return undefined here as this hook doesn't modify the main doc
        return doc
      },
    ],
  },
}
