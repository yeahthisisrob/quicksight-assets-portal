import { Router } from 'express';
import { AWSIdentityService } from '../services/awsIdentity.service';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const awsIdentityService = new AWSIdentityService();

// GET /api/settings/aws-identity
router.get('/aws-identity', asyncHandler(async (_req, res) => {
  const identity = await awsIdentityService.getIdentity();
  res.json({
    success: true,
    data: identity,
  });
}));

export { router as settingsRoutes };