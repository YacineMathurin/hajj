import axios from 'axios'
import mongoose from 'mongoose'

// ======== API CONFIG ========
const LOGIN_URL = 'https://api-extranetcgp-pprod.starinvest.pro/login'
const CUSTOMER_URL = 'https://api-extranetcgp-pprod.starinvest.pro/api/customers'

const API_LOGIN = 'abc'
const API_PASSWORD = 'aze'

// ======== MONGO CONFIG ========
const MONGO_URI = 'YOUR_MONGODB_ATLAS_CONNECTION_STRING'

// ======== MONGOOSE MODEL ========
const customerSchema = new mongoose.Schema({
  lastname: String,
  firstname: String,
  birthDate: String,
  civility: String,
  single: Boolean,
  iban: String,
  done: { type: Boolean, default: false },
})

const Customer = mongoose.model('Customer', customerSchema)

// ======== MAIN SCRIPT ========
async function main() {
  try {
    console.log('🔗 Connecting to MongoDB Atlas...')
    await mongoose.connect(MONGO_URI)
    console.log('✅ MongoDB connected')

    console.log('🔍 Fetching customers not done yet...')
    const customers = await Customer.find({ done: false })

    if (customers.length === 0) {
      console.log('⚠️ No pending customers to send.')
      return
    }

    console.log(`✅ ${customers.length} customers to process`)

    // Login to retrieve token
    console.log('🔐 Logging in to API...')
    const loginResponse = await axios.post(LOGIN_URL, {
      login: API_LOGIN,
      password: API_PASSWORD,
    })

    const token = loginResponse.data?.token

    if (!token) {
      console.error('❌ Token missing in login response')
      return
    }

    console.log('✅ Token retrieved successfully')

    const api = axios.create({
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    // Process customers sequentially
    for (const customer of customers) {
      console.log(`➡️ Sending customer: ${customer.firstname} ${customer.lastname}`)

      try {
        const response = await api.post(CUSTOMER_URL, customer.toObject())

        console.log('✅ Sent successfully:', response.status)

        // Mark as done
        customer.done = true
        await customer.save()

        console.log('🟢 Customer marked as done in DB')
      } catch (err) {
        console.error('❌ Error sending customer:', err.response?.data || err.message)
        console.log('⏭️ Skipping to next customer')
      }
    }

    console.log('🎉 Processing completed')
  } catch (err) {
    console.error('❌ Fatal error:', err.message)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 MongoDB connection closed')
  }
}

main()
