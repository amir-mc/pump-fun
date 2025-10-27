// getTokenByMint.js

import { PrismaClient } from "../generated/prisma"

const prisma = new PrismaClient()

async function getToken() {
  try {
    const token = await prisma.bondingCurveSignatureTest.findMany({
      where: {
        curveAddress: "qzGezedx4Y6Xm5YYpkQyve3QVMyd1oFBi44BuU7gaX3"
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