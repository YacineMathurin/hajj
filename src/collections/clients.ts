import { CollectionConfig } from 'payload';
import XLSX from 'xlsx';
import { jsPDF } from 'jspdf';

export const clients: CollectionConfig = {
  slug: 'clients',
  admin: {
    useAsTitle: 'prenom',
    description: 'Main Hajj clients database managed by Hajj Mabrouk',
    defaultColumns: ['nom', 'prenom', 'numeroPasseport', 'expiration', 'expirationStatus', 'paid', 'leftToPay']
  },
  fields: [
    {
      name: 'nom',
      type: 'text',
      required: true,
      label: 'Last Name'
    },
    {
      name: 'prenom',
      type: 'text',
      required: true,
      label: 'First Name'
    },
    {
      name: 'dateNaissance',
      type: 'date',
      label: 'Date of Birth'
    },
    {
      name: 'lieuNaissance',
      type: 'text',
      label: 'Place of Birth'
    },
    {
      name: 'numeroPasseport',
      type: 'text',
      required: true,
      unique: true,
      label: 'Passport Number'
    },
    {
      name: 'expiration',
      type: 'date',
      required: true,
      label: 'Passport Expiration Date'
    },
    {
      name: 'paid',
      type: 'number',
      required: true,
      defaultValue: 0,
      label: 'Amount Paid'
    },
    {
      name: 'leftToPay',
      type: 'number',
      required: true,
      defaultValue: 0,
      label: 'Amount Left to Pay'
    },
    {
      name: 'expirationStatus',
      type: 'select',
      options: [
        { label: 'OK (Valid >6 months)', value: 'OK' },
        { label: 'KO (Expires <6 months)', value: 'KO' }
      ],
      admin: {
        readOnly: true,
        description: 'Auto-calculated based on expiration date'
      },
      label: 'Passport Status'
    },
    {
      name: 'agentName',
      type: 'text',
      defaultValue: 'Hajj Mabrouk',
      admin: {
        readOnly: true
      },
      label: 'Agent Name'
    }
  ],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (data.expiration) {
          const expDate = new Date(data.expiration);
          const today = new Date();
          const sixMonthsLater = new Date();
          sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

          data.expirationStatus = expDate > sixMonthsLater ? 'OK' : 'KO';
        }
        return data;
      }
    ],
    afterChange: [
      async ({ doc, req, operation, collection }) => {
        if (collection?.slug === 'import-buffer' && operation === 'create') {
          try {
            const imports = await req.payload.find({
              collection: 'import-buffer',
              limit: 9999
            });

            const existingClients = await req.payload.find({
              collection: 'clients',
              limit: 9999
            });

            for (const client of existingClients.docs) {
              await req.payload.delete({
                collection: 'clients',
                id: client.id
              });
            }

            for (const item of imports.docs) {
              const expDate = new Date(item.expiration);
              const today = new Date();
              const sixMonthsLater = new Date();
              sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);

              await req.payload.create({
                collection: 'clients',
                data: {
                  nom: item.nom,
                  prenom: item.prenom,
                  dateNaissance: item.dateNaissance,
                  lieuNaissance: item.lieuNaissance,
                  numeroPasseport: item.numeroPasseport,
                  expiration: item.expiration,
                  paid: item.paid || 0,
                  leftToPay: item.leftToPay || 0,
                  expirationStatus: expDate > sixMonthsLater ? 'OK' : 'KO',
                  agentName: 'Hajj Mabrouk'
                }
              });
            }

            console.log(`✓ Successfully imported ${imports.docs.length} clients`);
          } catch (error) {
            console.error('Error processing import buffer:', error);
          }
        }
      }
    ]
  },
  endpoints: [
    {
      path: '/export',
      method: 'get',
      handler: async (req, res) => {
        try {
          const clients = await req.payload.find({
            collection: 'clients',
            limit: 9999
          });

          const data = clients.docs.map((c) => ({
            nom: c.nom,
            prenom: c.prenom,
            'date de naissance': c.dateNaissance || '',
            'lieu de naissance': c.lieuNaissance || '',
            'numero passeport': c.numeroPasseport,
            expiration: c.expiration,
            paid: c.paid,
            'left to pay': c.leftToPay
          }));

          const worksheet = XLSX.utils.json_to_sheet(data);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Clients');

          res.setHeader('Content-Disposition', 'attachment; filename="clients_hajj.xlsx"');
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

          const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
          return res.send(buffer);
        } catch (error) {
          return res.status(500).json({ error: error instanceof Error ? error.message : 'Export failed' });
        }
      }
    },
    {
      path: '/:id/pdf',
      method: 'get',
      handler: async (req, res) => {
        try {
          const clientId = req.params.id;

          const client = await req.payload.findByID({
            collection: 'clients',
            id: clientId
          });

          if (!client) {
            return res.status(404).json({ error: 'Client not found' });
          }

          const doc = new jsPDF();
          const pageHeight = doc.internal.pageSize.getHeight();
          let yPosition = 20;

          // Title
          doc.setFontSize(16);
          doc.setFont(undefined, 'bold');
          doc.text('HAJJ CLIENT PROFILE', 20, yPosition);
          yPosition += 20;

          // Agent Info
          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          doc.text(`Agent: ${client.agentName}`, 20, yPosition);
          yPosition += 15;

          // Personal Information Section
          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          doc.text('Personal Information', 20, yPosition);
          yPosition += 10;

          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          doc.text(`Name: ${client.prenom} ${client.nom}`, 20, yPosition);
          yPosition += 7;
          doc.text(`Date of Birth: ${client.dateNaissance || 'N/A'}`, 20, yPosition);
          yPosition += 7;
          doc.text(`Place of Birth: ${client.lieuNaissance || 'N/A'}`, 20, yPosition);
          yPosition += 7;
          doc.text(`Passport Number: ${client.numeroPasseport}`, 20, yPosition);
          yPosition += 7;
          doc.text(`Expiration Date: ${client.expiration}`, 20, yPosition);
          yPosition += 15;

          // Passport Status Section
          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          doc.text('Passport Status', 20, yPosition);
          yPosition += 10;

          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          if (client.expirationStatus === 'OK') {
            doc.setTextColor(0, 128, 0);
            doc.text('✓ OK - Passport is valid for more than 6 months', 20, yPosition);
          } else {
            doc.setTextColor(255, 0, 0);
            doc.text('✗ KO - Passport expires within 6 months', 20, yPosition);
          }
          doc.setTextColor(0, 0, 0);
          yPosition += 15;

          // Payment Information Section
          doc.setFontSize(12);
          doc.setFont(undefined, 'bold');
          doc.text('Payment Information', 20, yPosition);
          yPosition += 10;

          doc.setFontSize(10);
          doc.setFont(undefined, 'normal');
          doc.text(`Amount Paid: $${parseFloat(client.paid).toFixed(2)}`, 20, yPosition);
          yPosition += 7;
          doc.text(`Amount Left to Pay: $${parseFloat(client.leftToPay).toFixed(2)}`, 20, yPosition);
          yPosition += 7;
          const total = parseFloat(client.paid) + parseFloat(client.leftToPay);
          doc.setFont(undefined, 'bold');
          doc.text(`Total Amount: $${total.toFixed(2)}`, 20, yPosition);

          res.setHeader('Content-Disposition', `attachment; filename="${client.prenom}_${client.nom}_profile.pdf"`);
          res.setHeader('Content-Type', 'application/pdf');

          return res.send(Buffer.from(doc.output('arraybuffer')));
        } catch (error) {
          return res.status(500).json({ error: error instanceof Error ? error.message : 'PDF generation failed' });
        }
      }
    }
  ]
};