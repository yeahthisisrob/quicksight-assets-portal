# QuickSight Assets Portal

A comprehensive web portal for managing and exploring AWS QuickSight assets including dashboards, analyses, datasets, and data sources. This tool provides enhanced metadata management, tagging capabilities, and a detailed data catalog for QuickSight resources.

## Features

- **Dashboard Management**: Browse, search, and manage QuickSight dashboards with custom metadata
- **Asset Organization**: Organize assets using folders and tags
- **Data Catalog**: Explore datasets, fields, and their relationships
- **Field Metadata**: Add business context and documentation to dataset fields
- **Export Capabilities**: Export asset configurations and metadata
- **Permission Management**: View and understand asset permissions
- **AWS Authentication**: Supports multiple authentication methods (IAM credentials, AWS profiles, IAM roles)

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- AWS account with QuickSight enabled
- AWS credentials configured (via environment variables, AWS CLI profile, or IAM role)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/quicksight-assets-portal.git
cd quicksight-assets-portal
```

2. Install dependencies for both backend and frontend:
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

3. Configure environment variables:
```bash
# Copy the example environment file
cp .env.example ../.env

# Edit .env with your AWS configuration
```

## Configuration

### Backend Configuration (.env)

```env
# AWS Configuration
AWS_PROFILE=default                    # Optional: AWS CLI profile name
AWS_REGION=us-east-1                  # AWS region where QuickSight is configured
AWS_ACCOUNT_ID=your_account_id        # Your AWS account ID

# Optional: Direct AWS Credentials (if not using AWS CLI profile)
# AWS_ACCESS_KEY_ID=your_access_key
# AWS_SECRET_ACCESS_KEY=your_secret_key

# Backend Configuration
PORT=4000                             # Backend server port
NODE_ENV=development                  # Environment (development/production)

# S3 Configuration
BUCKET_NAME=quicksight-metadata-bucket-YOUR_ACCOUNT_ID  # S3 bucket for metadata storage
```

### Frontend Configuration (frontend/.env)

```env
VITE_API_URL=http://localhost:4000/api
VITE_AWS_REGION=us-east-1
VITE_AWS_ACCOUNT_ID=your_account_id
VITE_ENVIRONMENT=development
```

## AWS Permissions Required

The AWS credentials used must have the following permissions:

### QuickSight Permissions
- `quicksight:List*`
- `quicksight:Describe*`
- `quicksight:Search*`
- `quicksight:GetDashboardPermissions`
- `quicksight:UpdateDashboardPermissions`
- `quicksight:TagResource`
- `quicksight:UntagResource`
- `quicksight:ListTagsForResource`

### S3 Permissions (for metadata storage)
- `s3:CreateBucket`
- `s3:ListBucket`
- `s3:GetObject`
- `s3:PutObject`
- `s3:DeleteObject`

### STS Permissions (for identity verification)
- `sts:GetCallerIdentity`

## Running the Application

### Development Mode

1. Start the backend server:
```bash
cd backend
npm run dev
```

2. In a new terminal, start the frontend:
```bash
cd frontend
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

### Production Mode

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Start the backend in production mode:
```bash
cd backend
npm run build
npm start
```

## Project Structure

```
quicksight-assets-portal/
├── backend/                 # Backend Node.js/Express application
│   ├── routes/             # API route definitions
│   ├── services/           # Business logic and AWS SDK integrations
│   ├── middleware/         # Express middleware
│   ├── utils/              # Utility functions
│   └── server.ts           # Express server setup
├── frontend/               # Frontend React/TypeScript application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Page components
│   │   ├── services/       # API client services
│   │   ├── types/          # TypeScript type definitions
│   │   └── App.tsx         # Main App component
│   └── index.html          # HTML entry point
└── .env.example            # Example environment configuration
```

## API Endpoints

### Dashboards
- `GET /api/dashboards` - List all dashboards
- `GET /api/dashboards/:id` - Get dashboard details
- `GET /api/metadata/:id` - Get dashboard metadata
- `POST /api/metadata/:id` - Update dashboard metadata
- `GET /api/tags/:id` - Get dashboard tags
- `POST /api/tags/:id` - Update dashboard tags

### Assets
- `GET /api/assets/all` - List all QuickSight assets
- `GET /api/assets/export-summary` - Get export summary
- `POST /api/assets/export` - Export all assets
- `GET /api/assets/:type/:id` - Get specific asset
- `GET /api/assets/:type/:id/parse` - Parse asset configuration

### Data Catalog
- `GET /api/data-catalog` - Get complete data catalog
- `GET /api/data-catalog/search` - Search data catalog
- `GET /api/data-catalog/field-metadata` - Get field metadata
- `POST /api/data-catalog/field-metadata` - Update field metadata

### Folders & Organization
- `GET /api/folders` - List folder structure
- `GET /api/folders/:id/items` - List items in folder

### Settings
- `GET /api/settings/aws-identity` - Get current AWS identity information

## Features in Detail

### Dashboard Management
- View all QuickSight dashboards with usage metrics
- Add custom metadata (description, owner, category, etc.)
- Tag dashboards for better organization
- View and manage permissions

### Data Catalog
- Browse all datasets and their fields
- Add business descriptions to fields
- Track field usage across analyses and dashboards
- View calculated field definitions and dependencies

### Asset Export
- Export QuickSight asset configurations
- Useful for backup, documentation, or migration purposes
- Includes dashboards, analyses, datasets, and data sources

### Field Metadata Management
- Document dataset fields with business context
- Add descriptions, data types, and business rules
- Track field lineage and usage

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with React, TypeScript, Node.js, and Express
- Uses AWS SDK for JavaScript v3
- Material-UI for the user interface

## Support

For issues, questions, or contributions, please use the GitHub issue tracker.