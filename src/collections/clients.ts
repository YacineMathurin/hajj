import { CollectionConfig } from 'payload'
import { jsPDF } from 'jspdf'
import XLSX from 'xlsx'

interface ClientDoc {
  id: string
  nom: string
  prenom: string
  dateNaissance?: string
  lieuNaissance?: string
  numeroPasseport: string
  expiration: string
  paid: number
  leftToPay: number
  expirationStatus: 'OK' | 'KO'
  agentName: string
}

export const clients: CollectionConfig = {
  slug: 'clients',
  admin: {
    useAsTitle: 'prenom',
    description: 'Main Hajj clients database managed by Hajj Mabrouk',
    defaultColumns: [
      'nom',
      'prenom',
      'numeroPasseport',
      'expiration',
      'expirationStatus',
      'paid',
      'leftToPay',
    ],
    group: 'Management',
  },
  fields: [
    {
      name: 'nom',
      type: 'text',
      required: true,
      label: 'Last Name',
    },
    {
      name: 'prenom',
      type: 'text',
      required: true,
      label: 'First Name',
    },
    {
      name: 'dateNaissance',
      type: 'date',
      label: 'Date of Birth',
    },
    {
      name: 'lieuNaissance',
      type: 'text',
      label: 'Place of Birth',
    },
    {
      name: 'numeroPasseport',
      type: 'text',
      required: true,
      unique: true,
      label: 'Passport Number',
    },
    {
      name: 'expiration',
      type: 'date',
      required: true,
      label: 'Passport Expiration Date',
    },
    {
      name: 'paid',
      type: 'number',
      required: true,
      defaultValue: 0,
      label: 'Amount Paid',
    },
    {
      name: 'leftToPay',
      type: 'number',
      required: true,
      defaultValue: 0,
      label: 'Amount Left to Pay',
    },
    {
      name: 'expirationStatus',
      type: 'select',
      options: [
        { label: '✓ OK (Valid >6 months)', value: 'OK' },
        { label: '✗ KO (Expires <6 months)', value: 'KO' },
      ],
      admin: {
        readOnly: true,
        description: 'Auto-calculated based on expiration date',
      },
      label: 'Passport Status',
    },
    {
      name: 'agentName',
      type: 'text',
      defaultValue: 'Hajj Mabrouk',
      admin: {
        readOnly: true,
      },
      label: 'Agent Name',
    },
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data?.expiration) {
          const expDate = new Date(data.expiration)
          const today = new Date()
          const sixMonthsLater = new Date()
          sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6)

          data.expirationStatus = expDate > sixMonthsLater ? 'OK' : 'KO'
        }
        return data
      },
    ],
  },
  endpoints: [
    {
      path: '/export',
      method: 'get',
      handler: async (req, res) => {
        try {
          const payload = req.payload
          const clientsResult = await payload.find({
            collection: 'clients',
            limit: 9999,
          })

          const data = clientsResult.docs.map((c: any) => ({
            nom: c.nom,
            prenom: c.prenom,
            'date de naissance': c.dateNaissance || '',
            'lieu de naissance': c.lieuNaissance || '',
            'numero passeport': c.numeroPasseport,
            expiration: c.expiration,
            paid: c.paid,
            'left to pay': c.leftToPay,
          }))

          const worksheet = XLSX.utils.json_to_sheet(data)
          const workbook = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients')

          res.setHeader('Content-Disposition', 'attachment; filename="clients_hajj.xlsx"')
          res.setHeader(
            'Content-Type',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          )

          const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
          return res.send(buffer)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Export failed'
          return res.status(500).json({ error: message })
        }
      },
    },
    {
      path: '/:id/pdf',
      method: 'get',
      handler: async (req, res) => {
        try {
          const payload = req.payload
          const clientId = req.params.id as string

          const client = (await payload.findByID({
            collection: 'clients',
            id: clientId,
          })) as ClientDoc

          if (!client) {
            return res.status(404).json({ error: 'Client not found' })
          }

          const doc = new jsPDF()
          let yPosition = 20

          // Title
          doc.setFontSize(16)
          doc.setFont(undefined, 'bold')
          doc.text('HAJJ CLIENT PROFILE', 20, yPosition)
          yPosition += 20

          // Agent Info
          doc.setFontSize(10)
          doc.setFont(undefined, 'normal')
          doc.text(`Agent: ${client.agentName}`, 20, yPosition)
          yPosition += 15

          // Personal Information Section
          doc.setFontSize(12)
          doc.setFont(undefined, 'bold')
          doc.text('Personal Information', 20, yPosition)
          yPosition += 10

          doc.setFontSize(10)
          doc.setFont(undefined, 'normal')
          doc.text(`Name: ${client.prenom} ${client.nom}`, 20, yPosition)
          yPosition += 7
          doc.text(`Date of Birth: ${client.dateNaissance || 'N/A'}`, 20, yPosition)
          yPosition += 7
          doc.text(`Place of Birth: ${client.lieuNaissance || 'N/A'}`, 20, yPosition)
          yPosition += 7
          doc.text(`Passport Number: ${client.numeroPasseport}`, 20, yPosition)
          yPosition += 7
          doc.text(`Expiration Date: ${client.expiration}`, 20, yPosition)
          yPosition += 15

          // Passport Status Section
          doc.setFontSize(12)
          doc.setFont(undefined, 'bold')
          doc.text('Passport Status', 20, yPosition)
          yPosition += 10

          doc.setFontSize(10)
          doc.setFont(undefined, 'normal')
          if (client.expirationStatus === 'OK') {
            doc.setTextColor(0, 128, 0)
            doc.text('✓ OK - Passport is valid for more than 6 months', 20, yPosition)
          } else {
            doc.setTextColor(255, 0, 0)
            doc.text('✗ KO - Passport expires within 6 months', 20, yPosition)
          }
          doc.setTextColor(0, 0, 0)
          yPosition += 15

          // Payment Information Section
          doc.setFontSize(12)
          doc.setFont(undefined, 'bold')
          doc.text('Payment Information', 20, yPosition)
          yPosition += 10

          doc.setFontSize(10)
          doc.setFont(undefined, 'normal')
          doc.text(`Amount Paid: $${client.paid.toFixed(2)}`, 20, yPosition)
          yPosition += 7
          doc.text(`Amount Left to Pay: $${client.leftToPay.toFixed(2)}`, 20, yPosition)
          yPosition += 7
          const total = client.paid + client.leftToPay
          doc.setFont(undefined, 'bold')
          doc.text(`Total Amount: $${total.toFixed(2)}`, 20, yPosition)

          res.setHeader(
            'Content-Disposition',
            `attachment; filename="${client.prenom}_${client.nom}_profile.pdf"`,
          )
          res.setHeader('Content-Type', 'application/pdf')

          return res.send(Buffer.from(doc.output('arraybuffer')))
        } catch (error) {
          const message = error instanceof Error ? error.message : 'PDF generation failed'
          return res.status(500).json({ error: message })
        }
      },
    },
  ],
}
