import { Op } from "sequelize";
import {
  sequelize,
  CashRegister,
  CashRegisterUser,
  CashSession,
  PosSale,
  PosSaleItem,
  Product,
  StockMovement,
  User,
  Tenant,
} from "../models/index.js";
import { sanitizeString, sanitizeNumber, sanitizeInteger } from "../utils/sanitize.js";
import { sendECFToMSeller,} from "../services/msellerService.js";

const generateCode = (id) => `CAJA-${String(id).padStart(3, "0")}`;
const generateSaleNumber = (id) => `POS-${String(id).padStart(8, "0")}`;
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculateSessionSummary = async (tenantId, cashSessionId) => {
  const sales = await PosSale.findAll({
    where: { tenantId, cashSessionId, status: "paid" },
    include: [{ model: PosSaleItem, as: "items" }],
  });

  return sales.reduce(
    (acc, sale) => {
      const total = Number(sale.total || 0);
      const subtotal = Number(sale.subtotal || 0);
      const discount = Number(sale.discountTotal || 0);
      const tax = Number(sale.taxTotal || 0);
      const method = sale.paymentMethod || "cash";

      acc.salesCount += 1;
      acc.totalSales += total;
      acc.subtotal += subtotal;
      acc.discountTotal += discount;
      acc.taxTotal += tax;
      acc.itemsCount += (sale.items || []).reduce(
        (sum, item) => sum + Number(item.quantity || 0),
        0
      );

      if (!acc.byPaymentMethod[method]) acc.byPaymentMethod[method] = 0;
      acc.byPaymentMethod[method] += total;

      return acc;
    },
    {
      salesCount: 0,
      itemsCount: 0,
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      totalSales: 0,
      byPaymentMethod: {
        cash: 0,
        card: 0,
        transfer: 0,
        check: 0,
        mixed: 0,
      },
    }
  );
};

export const getCashRegisters = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const where = { tenantId };

    if (req.user.role !== "master") {
      const assignments = await CashRegisterUser.findAll({
        where: {
          tenantId,
          userId: req.user.id,
        },
      });

      const assignedIds = assignments.map((item) => item.cashRegisterId);

      where.id = assignedIds.length ? assignedIds : 0;
    }

    const registers = await CashRegister.findAll({
      where,
      include: [
        {
          model: User,
          as: "assignedUsers",
          attributes: ["id", "name", "email", "role"],
          through: { attributes: [] },
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json(registers);
  } catch (error) {
    console.log("GET CASH REGISTERS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo cajas" });
  }
};
export const createCashRegister = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const name = sanitizeString(req.body.name, 120);

    if (!name) {
      return res.status(400).json({ message: "El nombre de la caja es obligatorio" });
    }

    const register = await CashRegister.create({
      tenantId,
      name,
      code: "TEMP",
      createdBy: req.user.id,
      isActive: true,
    });

    await register.update({
      code: generateCode(register.id),
    });

    return res.status(201).json({
      message: "Caja creada correctamente",
      register,
    });
  } catch (error) {
    console.log("CREATE CASH REGISTER ERROR:", error);
    return res.status(500).json({ message: "Error creando caja" });
  }
};

export const updateCashRegister = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const register = await CashRegister.findOne({
      where: { id, tenantId },
    });

    if (!register) {
      return res.status(404).json({ message: "Caja no encontrada" });
    }

    const name = sanitizeString(req.body.name, 120);
    const isActive = req.body.isActive === false ? false : true;

    await register.update({
      name: name || register.name,
      isActive,
    });

    return res.json({
      message: "Caja actualizada correctamente",
      register,
    });
  } catch (error) {
    console.log("UPDATE CASH REGISTER ERROR:", error);
    return res.status(500).json({ message: "Error actualizando caja" });
  }
};

export const getOpenSession = async (req, res) => {
  try {
    const session = await CashSession.findOne({
      where: {
        tenantId: req.user.tenantId,
        userId: req.user.id,
        status: "open",
      },
      include: [{ model: CashRegister, as: "cashRegister" }],
      order: [["openedAt", "DESC"]],
    });

    return res.json(session);
  } catch (error) {
    console.log("GET OPEN SESSION ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo sesión de caja" });
  }
};

export const openCashSession = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const cashRegisterId = sanitizeInteger(req.body.cashRegisterId);
    const openingAmount = sanitizeNumber(req.body.openingAmount);

    const register = await CashRegister.findOne({
      where: { id: cashRegisterId, tenantId, isActive: true },
    });

    if (!register) {
      return res.status(404).json({ message: "Caja no encontrada o inactiva" });
    }

    if (req.user.role !== "master") {
      const assignment = await CashRegisterUser.findOne({
        where: {
          tenantId,
          cashRegisterId,
          userId,
        },
      });

      if (!assignment) {
        return res.status(403).json({
          message: "No tienes permiso para abrir esta caja",
        });
      }
    }

    const existingOpenSession = await CashSession.findOne({
      where: {
        tenantId,
        cashRegisterId,
        status: "open",
      },
    });

    if (existingOpenSession) {
      return res.status(400).json({
        message: "Esta caja ya está abierta",
      });
    }

    const userOpenSession = await CashSession.findOne({
      where: {
        tenantId,
        userId,
        status: "open",
      },
    });

    if (userOpenSession) {
      return res.status(400).json({
        message: "Ya tienes una caja abierta",
      });
    }

    const session = await CashSession.create({
      tenantId,
      cashRegisterId,
      userId,
      openingAmount,
      status: "open",
    });

    return res.status(201).json({
      message: "Caja abierta correctamente",
      session,
    });
  } catch (error) {
    console.log("OPEN CASH SESSION ERROR:", error);
    return res.status(500).json({ message: "Error abriendo caja" });
  }
};

export const closeCashSession = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const { id } = req.params;
    const closingAmount = sanitizeNumber(req.body.closingAmount);

    const session = await CashSession.findOne({
      where: {
        id,
        tenantId,
        userId,
        status: "open",
      },
    });

    if (!session) {
      return res.status(404).json({ message: "Sesión de caja no encontrada" });
    }

    const salesSummary = await calculateSessionSummary(tenantId, session.id);

    const openingAmount = Number(session.openingAmount || 0);
    const cashSales = Number(salesSummary.byPaymentMethod.cash || 0);
    const expectedAmount = openingAmount + cashSales;
    const difference = closingAmount - expectedAmount;

    await session.update({
      closingAmount,
      expectedAmount,
      difference,
      totalSales: Number(salesSummary.totalSales || 0),
      status: "closed",
      closedAt: new Date(),
    });

    return res.json({
      message: "Caja cerrada correctamente",
      session,
      summary: {
        openingAmount,
        salesCount: salesSummary.salesCount,
        totalSales: salesSummary.totalSales,
        cashSales,
        cardSales: salesSummary.byPaymentMethod.card || 0,
        transferSales: salesSummary.byPaymentMethod.transfer || 0,
        checkSales: salesSummary.byPaymentMethod.check || 0,
        mixedSales: salesSummary.byPaymentMethod.mixed || 0,
        expectedAmount,
        closingAmount,
        difference,
      },
    });
  } catch (error) {
    console.log("CLOSE CASH SESSION ERROR:", error);
    return res.status(500).json({ message: "Error cerrando caja" });
  }
};

const formatDateDDMMYYYY = (dateValue) => {
  const date = dateValue ? new Date(dateValue) : new Date();

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
};

const getPosTipoECF = (receiptType) => {
  return receiptType === "credit_fiscal" ? "31" : "32";
};

const buildECFPayloadFromPosSale = ({ sale, tenant, items, eNcf }) => {
  const tipoeCF = getPosTipoECF(sale.receiptType);

  const taxableAmount = roundMoney(
    items.reduce((acc, item) => acc + Number(item.total || 0), 0)
  );

  const itbisAmount = roundMoney(Number(sale.taxTotal || 0));
  const totalAmount = roundMoney(Number(sale.total || 0));

  return {
    ECF: {
      Encabezado: {
        Version: "1.0",
        IdDoc: {
          TipoeCF: tipoeCF,
          eNCF: eNcf,
          FechaVencimientoSecuencia: "31-12-2028",
          IndicadorEnvioDiferido: "1",
          IndicadorMontoGravado: "0",
          TipoIngresos: "01",
          TipoPago: "1",
          TotalPaginas: 1,
        },
        Emisor: {
          RNCEmisor: tenant.rnc,
          RazonSocialEmisor: tenant.legalName || tenant.businessName,
          DireccionEmisor: tenant.address || "Direccion no especificada",
          FechaEmision: formatDateDDMMYYYY(sale.createdAt),
        },
       Comprador: {
          RNCComprador:
            sale.receiptType === "credit_fiscal"
              ? sale.customerRnc
              : "00000000000",

          RazonSocialComprador:
            sale.receiptType === "credit_fiscal"
              ? sale.customerName
              : "Consumidor Final",
        },
        Totales: {
          MontoGravadoTotal: taxableAmount,
          MontoGravadoI1: taxableAmount,
          MontoExento: 0,
          ITBIS1: 18,
          TotalITBIS: itbisAmount,
          TotalITBIS1: itbisAmount,
          MontoTotal: totalAmount,
          MontoNoFacturable: 0,
        },
      },
      DetallesItems: {
        Item: items.map((item, index) => ({
          NumeroLinea: String(index + 1),
          IndicadorFacturacion: "1",
          NombreItem: item.productName,
          IndicadorBienoServicio: "1",
          CantidadItem: Number(item.quantity || 1),
          UnidadMedida: "43",
          PrecioUnitarioItem: roundMoney(item.unitPrice),
          DescuentoMonto: roundMoney(item.discountAmount),
          MontoItem: roundMoney(item.total),
        })),
      },
      Paginacion: {
        Pagina: [
          {
            PaginaNo: 1,
            NoLineaDesde: 1,
            NoLineaHasta: items.length,
            SubtotalMontoGravadoPagina: taxableAmount,
            SubtotalMontoGravado1Pagina: taxableAmount,
            SubtotalExentoPagina: 0,
            SubtotalItbisPagina: itbisAmount,
            SubtotalItbis1Pagina: itbisAmount,
            MontoSubtotalPagina: totalAmount,
            SubtotalMontoNoFacturablePagina: 0,
          },
        ],
      },
      FechaHoraFirma: "",
    },
  };
};

export const createPosSale = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;

    const cashSessionId = sanitizeInteger(req.body.cashSessionId);
    const paymentMethod = sanitizeString(req.body.paymentMethod || "cash", 20);
    const amountPaid = sanitizeNumber(req.body.amountPaid);
    const orderDiscount = sanitizeNumber(req.body.discountTotal);
    const receiptType = sanitizeString(req.body.receiptType, 30) || "consumer_final";
    const customerRnc = sanitizeString(req.body.customerRnc, 30) || null;
    const customerName = sanitizeString(req.body.customerName, 255) || null;

    const validReceiptTypes = ["consumer_final", "credit_fiscal", "regular"];

    if (!validReceiptTypes.includes(receiptType)) {
      await transaction.rollback();
      return res.status(400).json({ message: "Tipo de factura inválido" });
    }

    const items = Array.isArray(req.body.items) ? req.body.items : [];

    if (!items.length) {
      await transaction.rollback();
      return res.status(400).json({ message: "Agrega productos al ticket" });
    }

    const session = await CashSession.findOne({
      where: {
        id: cashSessionId,
        tenantId,
        userId,
        status: "open",
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!session) {
      await transaction.rollback();
      return res.status(400).json({ message: "No tienes una caja abierta" });
    }

    const tenant = await Tenant.findByPk(tenantId, {
    attributes: [
      "businessName",
      "rnc",
      "phone",
      "email",
      "address",
      "country",
      "invoiceTaxEnabled",
      "invoiceTaxRate",
      "usStateTaxRate",
      "usCountyTaxRate",
      "usCityTaxRate",
    ],
    transaction,
  });

 const taxEnabled = tenant?.invoiceTaxEnabled !== false;

  const taxRate =
    tenant?.country === "US"
      ? Number(tenant?.usStateTaxRate || 0) +
        Number(tenant?.usCountyTaxRate || 0) +
        Number(tenant?.usCityTaxRate || 0)
      : Number(tenant?.invoiceTaxRate || 18);

    let subtotal = 0;
    let lineDiscountTotal = 0;
    const saleItems = [];

    for (const item of items) {
      const productId = sanitizeInteger(item.productId);
      const quantity = sanitizeInteger(item.quantity);
      const rawDiscount = sanitizeNumber(item.discountAmount);

      if (!productId || quantity <= 0) {
        await transaction.rollback();
        return res.status(400).json({ message: "Producto o cantidad inválida" });
      }

      const product = await Product.findOne({
        where: {
          id: productId,
          tenantId,
          isActive: true,
          productType: "product",
        },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!product) {
        await transaction.rollback();
        return res.status(404).json({ message: "Producto no encontrado" });
      }

      if (product.trackStock && Number(product.stock) < quantity) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Stock insuficiente para ${product.name}`,
        });
      }

      const unitPrice = Number(product.salePrice || 0);
      const lineSubtotal = unitPrice * quantity;
      const discountAmount = Math.min(rawDiscount, lineSubtotal);
      const lineTotal = Math.max(lineSubtotal - discountAmount, 0);

      subtotal += lineSubtotal;
      lineDiscountTotal += discountAmount;

      saleItems.push({
        product,
        quantity,
        unitPrice,
        discountAmount,
        total: lineTotal,
      });
    }

    const maxOrderDiscount = Math.max(subtotal - lineDiscountTotal, 0);
    const safeOrderDiscount = Math.min(orderDiscount, maxOrderDiscount);
    const discountTotal = roundMoney(lineDiscountTotal + safeOrderDiscount);

    const taxableSubtotal = roundMoney(Math.max(subtotal - discountTotal, 0));
    const taxTotal = taxEnabled ? roundMoney(taxableSubtotal * (taxRate / 100)) : 0;
    const total = roundMoney(taxableSubtotal + taxTotal);
    const changeAmount = roundMoney(Math.max(amountPaid - total, 0));

    if (amountPaid < total && paymentMethod === "cash") {
      await transaction.rollback();
      return res.status(400).json({ message: "El monto pagado no cubre el total" });
    }

    const sale = await PosSale.create(
      {
        tenantId,
        cashRegisterId: session.cashRegisterId,
        cashSessionId: session.id,
        userId,
        saleNumber: "TEMP",
        subtotal,
        receiptType,
        customerRnc,
        customerName,
        discountTotal,
        taxTotal,
        total,
        paymentMethod,
        amountPaid,
        changeAmount,
        status: "paid",
      },
      { transaction }
    );

    await sale.update(
      {
        saleNumber: generateSaleNumber(sale.id),
      },
      { transaction }
    );

    for (const item of saleItems) {
      await PosSaleItem.create(
        {
          tenantId,
          posSaleId: sale.id,
          productId: item.product.id,
          productName: item.product.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          total: item.total,
        },
        { transaction }
      );

      if (item.product.trackStock) {
        const previousStock = Number(item.product.stock || 0);
        const newStock = previousStock - item.quantity;

        await item.product.update({ stock: newStock }, { transaction });

        await StockMovement.create(
          {
            tenantId,
            productId: item.product.id,
            userId,
            type: "exit",
            quantity: item.quantity,
            previousStock,
            newStock,
            reason: "Venta POS",
            referenceType: "system",
            referenceId: sale.id,
            referenceNumber: sale.saleNumber,
          },
          { transaction }
        );
      }
    }

    await session.update(
      {
        totalSales: Number(session.totalSales || 0) + total,
      },
      { transaction }
    );

   await transaction.commit();
   try {
      const createdSale = await PosSale.findOne({
        where: { id: sale.id, tenantId },
        include: [{ model: PosSaleItem, as: "items" }],
      });

     const tenantForECF = await Tenant.findByPk(tenantId, {
        attributes: [
          "businessName",
          "legalName",
          "rnc",
          "phone",
          "email",
          "address",
          "country",
        ],
      });
      if (tenantForECF?.country === "DO" && tenantForECF?.rnc && createdSale) {
        const tipoeCF = getPosTipoECF(createdSale.receiptType);

        const eNcf =
          req.body?.eNcf ||
          `E${tipoeCF}${String(Date.now()).slice(-10)}`;

        const payload = buildECFPayloadFromPosSale({
          sale: createdSale,
          tenant: tenantForECF,
          items: createdSale.items || [],
          eNcf,
        });

        const ecfResult = await sendECFToMSeller(payload);

        await createdSale.update({
          dgiiQrUrl: ecfResult.qr_url || null,
          eNcf: ecfResult.ecf || ecfResult.ncf || eNcf,
          tipoeCF,
          electronicInvoiceStatus: ecfResult.status || "Enviado",
          securityCode: ecfResult.securityCode || null,
        });
      }
    } catch (ecfError) {
      console.log(
        "POS ECF ERROR:",
        ecfError.response?.data || ecfError.message
      );
    }
    const saleDetail = await PosSale.findOne({
      where: {
        id: sale.id,
        tenantId,
      },
      include: [
        {
          model: PosSaleItem,
          as: "items",
        },
        {
          model: CashRegister,
          as: "cashRegister",
          attributes: ["id", "name", "code"],
        },
        {
          model: CashSession,
          as: "cashSession",
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    const tenantReceipt = await Tenant.findByPk(tenantId, {
      attributes: [
        "businessName",
        "rnc",
        "phone", 
        "email", 
        "address",
        "country",
        "invoiceTaxRate",
        "usStateTaxRate",
        "usCountyTaxRate",
        "usCityTaxRate",
      ],
    });

    return res.status(201).json({
      message: "Venta registrada correctamente",
      sale: {
        ...saleDetail.toJSON(),
        tenant: tenantReceipt,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.log("CREATE POS SALE ERROR:", error);
    return res.status(500).json({ message: "Error registrando venta POS" });
  }
};

export const getPosSales = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const where = {
      tenantId,
      status: "paid",
    };

    const cashRegisterId = sanitizeInteger(req.query.cashRegisterId);
    const paymentMethod = sanitizeString(req.query.paymentMethod, 20);
    const dateFrom = sanitizeString(req.query.dateFrom, 20);
    const dateTo = sanitizeString(req.query.dateTo, 20);

    if (cashRegisterId) {
      where.cashRegisterId = cashRegisterId;
    }

    if (paymentMethod && paymentMethod !== "all") {
      where.paymentMethod = paymentMethod;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};

      if (dateFrom) {
        where.createdAt[Op.gte] = new Date(`${dateFrom}T00:00:00`);
      }

      if (dateTo) {
        where.createdAt[Op.lte] = new Date(`${dateTo}T23:59:59`);
      }
    }

    const sales = await PosSale.findAll({
      where,
      include: [
        {
          model: PosSaleItem,
          as: "items",
        },
        {
          model: CashRegister,
          as: "cashRegister",
          attributes: ["id", "name", "code"],
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 300,
    });

    const summary = sales.reduce(
      (acc, sale) => {
        const total = Number(sale.total || 0);
        const method = sale.paymentMethod || "cash";

        acc.salesCount += 1;
        acc.total += total;

        if (!acc.byPaymentMethod[method]) {
          acc.byPaymentMethod[method] = 0;
        }

        acc.byPaymentMethod[method] += total;

        return acc;
      },
      {
        salesCount: 0,
        total: 0,
        byPaymentMethod: {
          cash: 0,
          card: 0,
          transfer: 0,
          check: 0,
          mixed: 0,
        },
      }
    );

    return res.json({
      sales,
      summary,
    });
  } catch (error) {
    console.log("GET POS SALES ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo ventas POS" });
  }
};

export const getPosSaleDetail = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { id } = req.params;

    const sale = await PosSale.findOne({
      where: {
        id,
        tenantId,
      },
      include: [
        {
          model: PosSaleItem,
          as: "items",
        },
        {
          model: CashRegister,
          as: "cashRegister",
          attributes: ["id", "name", "code"],
        },
        {
          model: CashSession,
          as: "cashSession",
        },
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (!sale) {
      return res.status(404).json({ message: "Venta no encontrada" });
    }

    const tenant = await Tenant.findByPk(tenantId, {
      attributes: [
        "businessName",
        "rnc",
        "phone",
        "email",
        "address",
        "country",
        "invoiceTaxEnabled",
        "invoiceTaxRate",
        "usStateTaxRate",
        "usCountyTaxRate",
        "usCityTaxRate",
      ],
    });
   
    return res.json({
      ...sale.toJSON(),
      tenant,
    });
  } catch (error) {
    console.log("GET POS SALE DETAIL ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo detalle de venta" });
  }
};

export const getPosUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: {
        tenantId: req.user.tenantId,
        isActive: true,
      },
      attributes: ["id", "name", "email", "role"],
      order: [["name", "ASC"]],
    });

    return res.json(users);
  } catch (error) {
    console.log("GET POS USERS ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo usuarios" });
  }
};

export const updateCashRegisterUsers = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const cashRegisterId = sanitizeInteger(req.params.id);
    const userIds = Array.isArray(req.body.userIds)
      ? req.body.userIds.map((id) => sanitizeInteger(id)).filter(Boolean)
      : [];

    const register = await CashRegister.findOne({
      where: {
        id: cashRegisterId,
        tenantId,
      },
    });

    if (!register) {
      return res.status(404).json({ message: "Caja no encontrada" });
    }

    await CashRegisterUser.destroy({
      where: {
        tenantId,
        cashRegisterId,
      },
    });

    if (userIds.length) {
      const validUsers = await User.findAll({
        where: {
          id: userIds,
          tenantId,
          isActive: true,
        },
        attributes: ["id"],
      });

      await CashRegisterUser.bulkCreate(
        validUsers.map((user) => ({
          tenantId,
          cashRegisterId,
          userId: user.id,
        }))
      );
    }

    return res.json({ message: "Usuarios asignados correctamente" });
  } catch (error) {
    console.log("UPDATE CASH REGISTER USERS ERROR:", error);
    return res.status(500).json({ message: "Error asignando usuarios a la caja" });
  }
};

export const getCashSessionSummary = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const userId = req.user.id;
    const sessionId = sanitizeInteger(req.params.id);

    const session = await CashSession.findOne({
      where: {
        id: sessionId,
        tenantId,
        userId,
      },
      include: [{ model: CashRegister, as: "cashRegister" }],
    });

    if (!session) {
      return res.status(404).json({ message: "Sesión de caja no encontrada" });
    }

    const salesSummary = await calculateSessionSummary(tenantId, session.id);
    const openingAmount = Number(session.openingAmount || 0);
    const cashSales = Number(salesSummary.byPaymentMethod.cash || 0);
    const expectedAmount = openingAmount + cashSales;

    return res.json({
      session,
      summary: {
        openingAmount,
        salesCount: salesSummary.salesCount,
        totalSales: salesSummary.totalSales,
        cashSales,
        cardSales: salesSummary.byPaymentMethod.card || 0,
        transferSales: salesSummary.byPaymentMethod.transfer || 0,
        checkSales: salesSummary.byPaymentMethod.check || 0,
        mixedSales: salesSummary.byPaymentMethod.mixed || 0,
        expectedAmount,
      },
    });
  } catch (error) {
    console.log("GET CASH SESSION SUMMARY ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo resumen de caja" });
  }
};

export const getCashSessionClosures = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const where = {
      tenantId,
      status: "closed",
    };

    const cashRegisterId = sanitizeInteger(req.query.cashRegisterId);
    const dateFrom = sanitizeString(req.query.dateFrom, 20);
    const dateTo = sanitizeString(req.query.dateTo, 20);

    if (cashRegisterId) where.cashRegisterId = cashRegisterId;

    if (dateFrom || dateTo) {
      where.closedAt = {};

      if (dateFrom) where.closedAt[Op.gte] = new Date(`${dateFrom}T00:00:00`);
      if (dateTo) where.closedAt[Op.lte] = new Date(`${dateTo}T23:59:59`);
    }

    const sessions = await CashSession.findAll({
      where,
      include: [
        { model: CashRegister, as: "cashRegister", attributes: ["id", "name", "code"] },
        { model: User, as: "user", attributes: ["id", "name", "email"] },
      ],
      order: [["closedAt", "DESC"]],
      limit: 300,
    });

    return res.json(sessions);
  } catch (error) {
    console.log("GET CASH SESSION CLOSURES ERROR:", error);
    return res.status(500).json({ message: "Error obteniendo historial de cierres" });
  }
};

export const getCashSessionReport = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const sessionId = sanitizeInteger(req.params.id);

    const session = await CashSession.findOne({
      where: {
        id: sessionId,
        tenantId,
        status: "closed",
      },
      include: [
        { model: CashRegister, as: "cashRegister", attributes: ["id", "name", "code"] },
        { model: User, as: "user", attributes: ["id", "name", "email"] },
      ],
    });

    if (!session) {
      return res.status(404).json({ message: "Cierre de caja no encontrado" });
    }

    const sales = await PosSale.findAll({
      where: {
        tenantId,
        cashSessionId: session.id,
        status: "paid",
      },
      include: [
        { model: PosSaleItem, as: "items" },
        { model: User, as: "user", attributes: ["id", "name", "email"] },
      ],
      order: [["createdAt", "ASC"]],
    });

    const summary = await calculateSessionSummary(tenantId, session.id);

    return res.json({
      session,
      summary: {
        openingAmount: Number(session.openingAmount || 0),
        closingAmount: Number(session.closingAmount || 0),
        expectedAmount: Number(session.expectedAmount || 0),
        difference: Number(session.difference || 0),
        salesCount: summary.salesCount,
        itemsCount: summary.itemsCount,
        subtotal: summary.subtotal,
        discountTotal: summary.discountTotal,
        taxTotal: summary.taxTotal,
        totalSales: summary.totalSales,
        cashSales: summary.byPaymentMethod.cash || 0,
        cardSales: summary.byPaymentMethod.card || 0,
        transferSales: summary.byPaymentMethod.transfer || 0,
        checkSales: summary.byPaymentMethod.check || 0,
        mixedSales: summary.byPaymentMethod.mixed || 0,
      },
      sales,
    });
  } catch (error) {
    console.log("GET CASH SESSION REPORT ERROR:", error);
    return res.status(500).json({ message: "Error generando reporte de caja" });
  }
};