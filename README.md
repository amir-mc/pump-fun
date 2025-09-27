# Pump.fun Listener TypeScript Project

This project is a TypeScript implementation of a WebSocket listener for the Pump.fun token creations. It connects to a WebSocket endpoint to listen for new token creation events and processes the incoming messages.

## Project Structure

```
pumpfun-listener-ts
├── src
│   ├── index.ts                # Entry point of the application
│   ├── listeners
│   │   └── PumpPortalListener.ts # WebSocket listener class
│   ├── types
│   │   └── index.ts            # Type definitions and interfaces
│   ├── utils
│   │   └── constants.ts        # Application constants
│   └── config
│       └── index.ts            # Configuration settings
├── package.json                 # npm dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── .env.example                 # Example environment variables
└── README.md                    # Project documentation
```

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd pumpfun-listener-ts
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on the `.env.example` file and fill in the required environment variables.

## Usage

To start the application, run:
```
npm start
```

This will initialize the application and start listening for new token creations.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.