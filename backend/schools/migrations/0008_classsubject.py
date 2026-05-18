from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0007_alter_user_module_permissions'),
    ]

    operations = [
        migrations.CreateModel(
            name='ClassSubject',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('display_order', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('school_class', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='subjects', to='schools.schoolclass')),
            ],
            options={
                'ordering': ['display_order', 'name'],
                'unique_together': {('school_class', 'name')},
            },
        ),
    ]
