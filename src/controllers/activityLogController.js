import { ActivityLog, User } from "../models/index.js";

export const getActivityLogs = async (req, res) => {
  try {
    const tenantId = req.user.tenantId;

    const logs = await ActivityLog.findAll({
      where: { tenantId },
      include: [
        {
          model: User,
          as: "user",
          attributes: ["id", "name", "email", "role"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 100,
    });

    return res.json(logs);
  } catch (error) {
    console.log("GET ACTIVITY LOGS ERROR:", error);
    return res.status(500).json({
      message: "Error cargando actividad",
    });
  }
};