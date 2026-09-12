'use strict';

const { Router } = require('express');
const { body }   = require('express-validator');
const authorize  = require('../../middleware/authorize');
const ctrl       = require('./products.controller');

const router = Router();

// QR scan lookup — must be before /:id to avoid route conflict
router.get('/sku/:sku', ctrl.getBySku);

router.get('/',    ctrl.list);
router.get('/:id', ctrl.getOne);

router.post(
  '/',
  authorize('owner', 'cashier'),
  [
    body('name').trim().notEmpty().withMessage('Product name is required'),
    body('unit_price').isFloat({ gt: 0 }).withMessage('Unit price must be > 0'),
    body('category_id').optional().isInt(),
    body('supplier_id').optional().isInt(),
    body('supplier_name').optional().trim(),
    body('size').optional().trim(),
    body('color').optional().trim(),
    body('material').optional().trim(),
    body('brand').optional().trim(),
    body('unit_of_sale').optional().trim().isIn(['piece', 'set', 'pack']).withMessage('unit_of_sale must be piece, set, or pack'),
    body('set_pieces').optional({ nullable: true }).isInt({ min: 1 }),
    body('quantity').optional().isInt({ min: 0 }),
    body('low_stock_threshold').optional().isInt({ min: 0 }),
    body('cost_price').optional().isFloat({ min: 0 }),
  ],
  ctrl.create
);

router.patch(
  '/:id',
  authorize('owner'),
  [
    body('name').optional().trim().notEmpty(),
    body('unit_price').optional().isFloat({ gt: 0 }),
    body('cost_price').optional().isFloat({ min: 0 }),
    body('low_stock_threshold').optional().isInt({ min: 0 }),
    body('supplier_id').optional().isInt(),
    body('supplier_name').optional().trim(),
    body('size').optional().trim(),
    body('color').optional().trim(),
    body('material').optional().trim(),
    body('brand').optional().trim(),
    body('unit_of_sale').optional().trim().isIn(['piece', 'set', 'pack']).withMessage('unit_of_sale must be piece, set, or pack'),
    body('set_pieces').optional({ nullable: true }).isInt({ min: 1 }),
  ],
  ctrl.update
);

router.patch(
  '/:id/adjust-stock',
  authorize('owner', 'cashier'),
  [
    body('quantity_change')
      .isInt()
      .not().equals('0')
      .withMessage('quantity_change must be a non-zero integer'),
  ],
  ctrl.adjustStock
);

router.delete(
  '/:id',
  authorize('owner'),
  [
    body('strategy').optional().isIn(['write_off', 'transfer']).withMessage('strategy must be write_off or transfer'),
    body('replacement_name').optional().trim().notEmpty().withMessage('replacement_name cannot be empty'),
  ],
  ctrl.remove
);

module.exports = router;
