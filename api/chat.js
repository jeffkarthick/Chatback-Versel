export default async function handler(req, res) {
  console.log("CHAT REQUEST METHOD:", req.method);
  console.log("CHAT REQUEST BODY:", req.body);

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only"
    });
  }

  return res.status(200).json({
    success: true,
    received: req.body || null,
    message: "CHAT API IS WORKING"
  });
}