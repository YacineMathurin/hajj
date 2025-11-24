import { CollectionConfig } from 'payload'
import { jsPDF } from 'jspdf'

interface ClientDoc {
  id: string
  nom: string
  prenom: string
  dateNaissance?: Date
  lieuNaissance?: string
  numeroPasseport: string
  expiration: Date
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
    components: {
      edit: {
        SaveButton: '@/components/editActions',
      },
    },
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
      path: '/generate-pdf/:id',
      method: 'get',
      handler: async (req: { payload: any; routeParams?: { id?: string } }) => {
        try {
          const payload = req.payload
          const clientId = req.routeParams?.id
          const FONT = 'Helvetica' // Clean modern font
          const HEADER_COLOR = [30, 78, 93] // Deep Teal/Blue
          const LIGHT_GRAY = [220, 220, 220]

          if (!clientId) {
            return new Response(JSON.stringify({ error: 'Client ID missing' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          const client = (await payload.findByID({
            collection: 'clients',
            id: clientId,
            req: req,
          })) as ClientDoc

          if (!client) {
            return new Response(JSON.stringify({ error: 'Client not found' }), {
              status: 404,
              headers: { 'Content-Type': 'application/json' },
            })
          }

          const doc = new jsPDF()
          let yPosition = 15
          const margin = 20
          const pageWidth = doc.internal.pageSize.getWidth()
          const currencySymbol = 'FCFA' // Fixed positions for two-column alignment
          const labelX1 = margin
          const valueX1 = labelX1 + 45
          const labelX2 = pageWidth / 2 + 5
          const valueX2 = labelX2 + 35
          const amountX = pageWidth - margin // Right alignment for amounts
          const headerHeight = 8 // Height of the colored section header bar
          // ----------------------------------------------------
          // 1. DOCUMENT HEADER
          // ----------------------------------------------------

          doc.setFontSize(10)
          doc.setFont(FONT, 'normal')
          doc.setTextColor(0, 0, 0) // Left Aligned Header
          doc.text('RÉPUBLIQUE DU NIGER', margin, yPosition, { align: 'left' })
          yPosition += 5
          doc.text('Fraternité - Travail - Progrès', margin, yPosition, { align: 'left' }) // Right Aligned Organization Info
          doc.text('Organisateur de Pèlerinage', amountX, yPosition, { align: 'right' })
          yPosition += 10 // Main Title (Centered)

          doc.setFontSize(22)
          doc.setFont(FONT, 'bold')
          doc.text('PROFIL CLIENT HAJJ', pageWidth / 2, yPosition, { align: 'center' })
          yPosition += 8 // Subtitle and Separator
          doc.setFontSize(10)
          doc.setFont(FONT, 'normal')
          doc.setDrawColor(HEADER_COLOR[0], HEADER_COLOR[1], HEADER_COLOR[2])
          doc.line(margin, yPosition, pageWidth - margin, yPosition)
          doc.text(
            `Fiche Générée le: ${new Date().toLocaleDateString('fr-FR')}`,
            pageWidth / 2,
            yPosition + 4,
            { align: 'center' },
          )
          yPosition += 10 // Agent Info Block

          doc.setFontSize(11)
          doc.setFont(FONT, 'bold')
          doc.text(`Agent Responsable:`, margin, yPosition)
          doc.setFont(FONT, 'normal')
          doc.text(`${client.agentName}`, margin + 40, yPosition)
          yPosition += 10 // ----------------------------------------------------
          // 2. Personal Information Section
          // ----------------------------------------------------
          // Draw colored background for the section header

          doc.setFillColor(HEADER_COLOR[0], HEADER_COLOR[1], HEADER_COLOR[2])
          doc.rect(margin, yPosition, pageWidth - 2 * margin, headerHeight, 'F')
          doc.setFontSize(12)
          doc.setFont(FONT, 'bold')
          doc.setTextColor(255, 255, 255) // White text for contrast
          doc.text('1. INFORMATIONS PERSONNELLES', margin + 2, yPosition + 5)
          doc.setTextColor(0, 0, 0) // Reset text color
          yPosition += headerHeight + 5

          doc.setFontSize(10) // Row 1: Nom / Prénom

          doc.setFont(FONT, 'bold')
          doc.text(`Nom:`, labelX1, yPosition)
          doc.text(`Prénom:`, labelX2, yPosition)
          doc.setFont(FONT, 'normal')
          doc.text(`${client.nom.toUpperCase()}`, valueX1, yPosition)
          doc.text(`${client.prenom}`, valueX2, yPosition)
          yPosition += 7 // Row 2: Date de Naissance / Lieu de Naissance

          doc.setFont(FONT, 'bold')
          doc.text(`Date de Naissance:`, labelX1, yPosition)
          doc.text(`Lieu de Naissance:`, labelX2, yPosition)
          doc.setFont(FONT, 'normal')
          doc.text(
            `${new Date(client?.dateNaissance || '')?.toLocaleDateString('fr-FR') || 'N/A'}`,
            valueX1,
            yPosition,
          )
          doc.text(`${client.lieuNaissance || 'N/A'}`, valueX2, yPosition)
          yPosition += 10 // ----------------------------------------------------
          // 3. Passport Information Section
          // ----------------------------------------------------
          // Draw colored background for the section header

          doc.setFillColor(HEADER_COLOR[0], HEADER_COLOR[1], HEADER_COLOR[2])
          doc.rect(margin, yPosition, pageWidth - 2 * margin, headerHeight, 'F')

          doc.setFontSize(12)
          doc.setFont(FONT, 'bold')
          doc.setTextColor(255, 255, 255) // White text for contrast
          doc.text('2. STATUT DU PASSEPORT', margin + 2, yPosition + 5)
          doc.setTextColor(0, 0, 0) // Reset text color
          yPosition += headerHeight + 5 // Row 1: Numéro de Passeport / Date d'Expiration

          doc.setFontSize(10)
          doc.setFont(FONT, 'bold')
          doc.text(`Numéro de Passeport:`, labelX1, yPosition)
          doc.text(`Date d'Expiration:`, labelX2, yPosition)
          doc.setFont(FONT, 'normal')
          doc.text(`${client.numeroPasseport}`, valueX1, yPosition)
          doc.text(`${new Date(client.expiration).toLocaleDateString('fr-FR')}`, valueX2, yPosition)
          yPosition += 10 // Passport Status Result

          doc.setFont(FONT, 'bold')
          doc.text('Validité (Minimum 6 mois):', margin, yPosition)
          doc.setFont(FONT, 'normal')

          const statusTextX = margin + 50

          if (client.expirationStatus === 'OK') {
            doc.setTextColor(0, 128, 0)
            doc.text('OK - Valide pour le Pèlerinage.', statusTextX, yPosition)
          } else {
            doc.setTextColor(255, 0, 0)
            doc.text('✗ KO - Expiration imminente. Renouvellement requis.', statusTextX, yPosition)
          }
          doc.setTextColor(0, 0, 0) // Reset color
          yPosition += 15 // ----------------------------------------------------
          // 4. Payment Information Section (Right-Aligned Receipt Style)
          // ----------------------------------------------------
          // Draw colored background for the section header

          doc.setFillColor(HEADER_COLOR[0], HEADER_COLOR[1], HEADER_COLOR[2])
          doc.rect(margin, yPosition, pageWidth - 2 * margin, headerHeight, 'F')

          doc.setFontSize(12)
          doc.setFont(FONT, 'bold')
          doc.setTextColor(255, 255, 255) // White text for contrast
          doc.text('3. RENSEIGNEMENTS FINANCIERS', margin + 2, yPosition + 5)
          doc.setTextColor(0, 0, 0) // Reset text color
          yPosition += headerHeight + 7
          const total = client.paid + client.leftToPay // Total
          doc.setFontSize(10)
          doc.setFont(FONT, 'bold')
          doc.text('Montant Total du Pèlerinage:', margin, yPosition)
          doc.text(
            `${currencySymbol} ${total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`,
            amountX,
            yPosition,
            {
              align: 'right',
            },
          )
          yPosition += 7 // Paid

          doc.setFont(FONT, 'normal')
          doc.text('Montant Payé (Reçu):', margin, yPosition)
          doc.setTextColor(0, 100, 0)
          doc.text(
            `${currencySymbol} ${client.paid.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`,
            amountX,
            yPosition,
            {
              align: 'right',
            },
          )
          doc.setTextColor(0, 0, 0) // Reset color
          yPosition += 7 // Remaining

          doc.text('Reste à Payer:', margin, yPosition)
          doc.setFont(FONT, 'bold') // Light gray line above the final amount for visual separation
          doc.setDrawColor(LIGHT_GRAY[0], LIGHT_GRAY[1], LIGHT_GRAY[2])
          doc.line(pageWidth - margin - 50, yPosition - 1, amountX - 30, yPosition - 1)
          doc.setTextColor(100, 100, 10)
          doc.text(
            `${currencySymbol} ${client.leftToPay.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`,
            amountX,
            yPosition,
            {
              align: 'right',
            },
          )
          doc.setTextColor(0, 0, 0) // Reset color
          doc.setDrawColor(0, 0, 0) // Reset line color
          yPosition += 7 // Final Separator

          yPosition += 5
          doc.line(margin, yPosition, pageWidth - margin, yPosition)
          yPosition += 5 // ----------------------------------------------------
          // 5. Footer / Signature Section (Aligned)
          // ----------------------------------------------------
          doc.setFontSize(10)
          doc.setFont(FONT, 'normal')
          const signatureY = doc.internal.pageSize.getHeight() - 80
          const clientX = margin + 30
          const companyX = pageWidth - margin - 40

          doc.setFont(FONT, 'bold')
          doc.text('Signature du Client', clientX, signatureY)
          doc.text("Cachet et Signature de l'Agence", companyX, signatureY)
          doc.setFont(FONT, 'normal') // Signature Lines
          // doc.line(clientX - 10, signatureY + 5, clientX + 45, signatureY + 5)
          // doc.line(companyX - 10, signatureY + 5, companyX + 55, signatureY + 5) // Get the PDF binary data

          const pdfBuffer = Buffer.from(doc.output('arraybuffer')) // Return a new Response object

          return new Response(pdfBuffer, {
            status: 200,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${client.prenom}_${client.nom}_profile.pdf"`,
            },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'PDF generation failed'
          console.error('PDF generation error:', error) // Return error as a new Response object
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  ],
}
