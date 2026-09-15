# Exact residue and contour MVP (C08)

C08 adds an **Analyze** layer over the existing Function Explorer and Residue/Path
Lab. It does not replace the immediate JavaScript previews added before C08.

## UI location

Open **Complex Analysis -> Residue Lab**, select one of the reviewed expressions,
open the **Residue** inspector tab, and choose **Analyze exact residue + contour**.
The green C08 inspector shows exact symbolic status, source revision, derivative,
singularity classification, residues, local series, adaptive contour error/samples,
and the argument-principle `zeros - poles` result. The blue C06 numerical publisher
and the original live values remain alongside it.

## MVP evidence boundary

The exact profile set is `1/z`, `1/(z^2+1)`, `sin(z)/z`, and `exp(z)`. These profiles
have reviewed exact derivatives, pole/removable classification, residues, and
Laurent/Taylor terms. Other expressions keep their fast preview and may have an exact
derivative AST, but exact singularity/residue/series status remains `unsupported`
until an exact backend publishes it.

Contour integration is adaptive numerical evidence, stored in a separate numerical
F06 envelope with tolerance, error estimate, sample count, and source provenance.
Argument-principle output is reported as an integer only when the computed winding is
within its qualification threshold.
