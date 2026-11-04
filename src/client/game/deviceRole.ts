/** UA は初期値にだけ使い、ロビーで本人が切り替えられる。 */
export function defaultHostRole(ua: string = navigator.userAgent): "gm" | "admin" {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) ? "gm" : "admin";
}
