// getTokenByMint.js

import { PrismaClient } from "../generated/prisma"

const prisma = new PrismaClient()

async function getToken() {
  try {
    const token = await prisma.token.findUnique({
      where: {
        mintAddress: "8WTcjSq1XkCMzCQCRXXFP3YXZp1bN2dZkpxkibfppump"
      }
    })
    
    if (token) {
      console.log('Token found:')
      console.log('mintAddress:', token.mintAddress)
      console.log('name:', token.name)
      console.log('symbol:', token.symbol)
      console.log('bondingCurve:', token.bondingCurve)
      console.log('creator:', token.creator)
      console.log('signature:', token.signature)
      console.log('timestamp:', token.timestamp)
      console.log('Tokenprice:', token.Tokenprice)
      console.log('totalSupply:', token.totalSupply.toString()) // Convert BigInt to string
      console.log('complete:', token.complete)
      console.log('virtualTokenReserves:', token.virtualTokenReserves.toString())
      console.log('virtualSolReserves:', token.virtualSolReserves.toString())
      console.log('realTokenReserves:', token.realTokenReserves.toString())
      console.log('realSolReserves:', token.realSolReserves.toString())
      console.log('createdAt:', token.createdAt)
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