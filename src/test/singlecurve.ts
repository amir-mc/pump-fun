// getTokenByMint.js

import { PrismaClient } from "../generated/prisma"

const prisma = new PrismaClient()

async function getToken() {
  try {
    const token = await prisma.bondingCurveSignature.findMany({
      where: {
        curveAddress: "EEyKhvRcwXKU2SQVimCNJYxKVtw1GXJZTprpfSQqNhue"
      }
    })
    
    if (token) {
      console.log(token)
    } else {
      console.log('No token found with mintAddress: 321321321')
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

getToken()